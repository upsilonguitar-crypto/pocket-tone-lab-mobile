package fr.pockettonelab.mobile;

import android.content.Context;
import android.media.midi.MidiDevice;
import android.media.midi.MidiDeviceInfo;
import android.media.midi.MidiInputPort;
import android.media.midi.MidiManager;
import android.media.midi.MidiOutputPort;
import android.media.midi.MidiReceiver;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Native Android MIDI transport with a fail-closed Hardware Guard. */
public final class MidiHardwareController {
    private final MainActivity activity;
    private final MidiManager midiManager;
    private final List<MidiDeviceInfo> lastDevices = new ArrayList<>();
    private MidiDevice midiDevice;
    private MidiInputPort inputPort;   // App -> device
    private MidiOutputPort outputPort; // Device -> app
    private volatile boolean writeArmed = false;
    private volatile boolean persistentArmed = false;
    private String connectedName = null;

    public MidiHardwareController(MainActivity activity) {
        this.activity = activity;
        this.midiManager = (MidiManager) activity.getSystemService(Context.MIDI_SERVICE);
    }

    public synchronized String scanJson() {
        JSONArray arr = new JSONArray();
        lastDevices.clear();
        if (midiManager == null) return arr.toString();
        MidiDeviceInfo[] devices = midiManager.getDevices();
        for (MidiDeviceInfo info : devices) {
            if (info.getInputPortCount() < 1) continue; // Need an input port to send SysEx to hardware.
            lastDevices.add(info);
            try {
                JSONObject o = new JSONObject();
                Bundle p = info.getProperties();
                String name = str(p.getString(MidiDeviceInfo.PROPERTY_NAME));
                String product = str(p.getString(MidiDeviceInfo.PROPERTY_PRODUCT));
                String manufacturer = str(p.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER));
                if (name.isEmpty()) name = (manufacturer + " " + product).trim();
                if (name.isEmpty()) name = "MIDI Device " + info.getId();
                o.put("index", lastDevices.size() - 1);
                o.put("id", info.getId());
                o.put("name", name);
                o.put("manufacturer", manufacturer);
                o.put("product", product);
                o.put("inputPorts", info.getInputPortCount());
                o.put("outputPorts", info.getOutputPortCount());
                o.put("type", typeLabel(info.getType()));
                arr.put(o);
            } catch (Exception ignored) { }
        }
        return arr.toString();
    }

    public String connectJson(int index) {
        try {
            if (index < 0 || index >= lastDevices.size()) return error("Périphérique MIDI introuvable.");
            disconnect();
            MidiDeviceInfo info = lastDevices.get(index);
            CountDownLatch latch = new CountDownLatch(1);
            final MidiDevice[] opened = new MidiDevice[1];
            midiManager.openDevice(info, device -> { opened[0] = device; latch.countDown(); }, new Handler(Looper.getMainLooper()));
            if (!latch.await(4, TimeUnit.SECONDS) || opened[0] == null) return error("Délai de connexion MIDI dépassé.");
            midiDevice = opened[0];
            inputPort = midiDevice.openInputPort(0);
            if (inputPort == null) { disconnect(); return error("Port MIDI d'entrée indisponible."); }
            if (info.getOutputPortCount() > 0) {
                outputPort = midiDevice.openOutputPort(0);
                if (outputPort != null) outputPort.connect(receiver);
            }
            Bundle p = info.getProperties();
            connectedName = str(p.getString(MidiDeviceInfo.PROPERTY_NAME));
            if (connectedName.isEmpty()) connectedName = str(p.getString(MidiDeviceInfo.PROPERTY_PRODUCT));
            if (connectedName.isEmpty()) connectedName = "MIDI Device " + info.getId();
            // Always re-lock writes on every new connection.
            setWriteArmed(false);
            JSONObject ok = new JSONObject();
            ok.put("ok", true); ok.put("name", connectedName); ok.put("readPort", outputPort != null);
            return ok.toString();
        } catch (Exception e) {
            disconnect();
            return error(e.getMessage());
        }
    }

    public synchronized void disconnect() {
        writeArmed = false; persistentArmed = false; connectedName = null;
        try { if (outputPort != null) outputPort.disconnect(receiver); } catch (Exception ignored) { }
        try { if (outputPort != null) outputPort.close(); } catch (Exception ignored) { }
        try { if (inputPort != null) inputPort.close(); } catch (Exception ignored) { }
        try { if (midiDevice != null) midiDevice.close(); } catch (Exception ignored) { }
        outputPort = null; inputPort = null; midiDevice = null;
    }

    public void setWriteArmed(boolean armed) {
        writeArmed = armed;
        if (!armed) persistentArmed = false;
    }

    public void setPersistentArmed(boolean armed) {
        persistentArmed = armed && writeArmed;
    }

    public String sendSysExJson(String hex, boolean permanent) {
        try {
            if (inputPort == null || midiDevice == null) return error("Pocket Master non connecté.");
            if (!writeArmed) return error("Hardware Guard actif : écriture MIDI refusée.");
            if (permanent && !persistentArmed) return error("Hardware Guard : écriture permanente non autorisée.");
            byte[] bytes = hexToBytes(hex);
            if (bytes.length < 2 || (bytes[0] & 0xFF) != 0xF0 || (bytes[bytes.length - 1] & 0xFF) != 0xF7) {
                return error("Commande non SysEx refusée.");
            }
            // Additional sanity limit: preset commands are tiny; refuse suspiciously large writes.
            if (bytes.length > 2048) return error("Commande SysEx anormalement grande refusée.");
            inputPort.send(bytes, 0, bytes.length, 0);
            JSONObject ok = new JSONObject(); ok.put("ok", true); ok.put("bytes", bytes.length);
            return ok.toString();
        } catch (Exception e) { return error(e.getMessage()); }
    }

    private final MidiReceiver receiver = new MidiReceiver() {
        @Override public void onSend(byte[] msg, int offset, int count, long timestamp) throws IOException {
            if (count <= 0) return;
            StringBuilder sb = new StringBuilder(count * 2);
            for (int i = 0; i < count; i++) sb.append(String.format(Locale.ROOT, "%02X", msg[offset + i] & 0xFF));
            activity.onMidiReceived(sb.toString());
        }
    };

    private static byte[] hexToBytes(String hex) {
        String s = hex == null ? "" : hex.replaceAll("\\s+", "");
        if ((s.length() & 1) != 0) throw new IllegalArgumentException("Hex SysEx invalide.");
        byte[] out = new byte[s.length() / 2];
        for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(s.substring(i * 2, i * 2 + 2), 16);
        return out;
    }

    private static String typeLabel(int type) {
        switch (type) {
            case MidiDeviceInfo.TYPE_USB: return "USB";
            case MidiDeviceInfo.TYPE_BLUETOOTH: return "Bluetooth";
            case MidiDeviceInfo.TYPE_VIRTUAL: return "Virtual";
            default: return "MIDI";
        }
    }
    private static String str(String s) { return s == null ? "" : s; }
    private static String error(String message) {
        try { JSONObject o = new JSONObject(); o.put("ok", false); o.put("error", message == null ? "Erreur MIDI" : message); return o.toString(); }
        catch (Exception e) { return "{\"ok\":false,\"error\":\"Erreur MIDI\"}"; }
    }
}
