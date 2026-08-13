package fr.pockettonelab.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.content.pm.PackageManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.view.WindowManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int REQ_FILE = 1201;
    private static final int REQ_SAVE = 1202;
    private static final int REQ_AUDIO = 1203;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingWebPermission;
    private byte[] pendingSaveBytes;
    private String pendingSaveMime = "application/octet-stream";
    private MidiHardwareController midi;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(5,7,10));
        getWindow().setNavigationBarColor(Color.rgb(5,7,10));
        if (Build.VERSION.SDK_INT >= 23) getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR & 0);

        midi = new MidiHardwareController(this);
        webView = new WebView(this);
        webView.setLayoutParams(new android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(webView);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true); s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setBuiltInZoomControls(false); s.setDisplayZoomControls(false);
        // Mobile app: render at the physical CSS width of the phone.
        // The previous wide/overview mode could keep a desktop-like layout and cause horizontal panning.
        s.setLoadWithOverviewMode(false); s.setUseWideViewPort(true); s.setTextZoom(100);
        s.setSupportZoom(false);
        webView.setInitialScale(0);
        webView.setHorizontalScrollBarEnabled(false);
        if (Build.VERSION.SDK_INT >= 16) {
            s.setAllowFileAccessFromFileURLs(true);
            s.setAllowUniversalAccessFromFileURLs(true); // runtime PocketEdit protocol refresh from raw GitHub.
        }
        webView.setBackgroundColor(Color.rgb(5,7,10));
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"audio/*","application/octet-stream","application/json","*/*"});
                startActivityForResult(i, REQ_FILE);
                return true;
            }

            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean asksAudio = false;
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) { asksAudio = true; break; }
                    }
                    if (!asksAudio) { request.deny(); return; }
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        pendingWebPermission = request;
                        ActivityCompat.requestPermissions(MainActivity.this, new String[]{Manifest.permission.RECORD_AUDIO}, REQ_AUDIO);
                    }
                });
            }
        });
        webView.addJavascriptInterface(new NativeBridge(), "AndroidBridge");
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    @Override protected void onDestroy() {
        if (midi != null) midi.disconnect();
        if (webView != null) { webView.removeJavascriptInterface("AndroidBridge"); webView.destroy(); }
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        // Let the SPA close drawer/modal first; a second back exits normally.
        webView.evaluateJavascript("(function(){var m=document.querySelector('.modal-shell.open'),d=document.querySelector('#presetBrowser.open');if(m){document.querySelector('[data-close-transfer]')?.click();return 'handled'}if(d){document.querySelector('#togglePresetDrawer')?.click();return 'handled'}return 'exit'})()", value -> {
            if (value == null || value.contains("exit")) MainActivity.super.onBackPressed();
        });
    }


    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_AUDIO && pendingWebPermission != null) {
            PermissionRequest req = pendingWebPermission;
            pendingWebPermission = null;
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                req.deny();
                showToastJs("Permission microphone refusée");
            }
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
            if (fileCallback != null) fileCallback.onReceiveValue(result);
            fileCallback = null;
        } else if (requestCode == REQ_SAVE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingSaveBytes != null) {
                try (OutputStream os = getContentResolver().openOutputStream(data.getData())) { if (os != null) os.write(pendingSaveBytes); }
                catch (Exception e) { showToastJs("Sauvegarde impossible : " + e.getMessage()); }
            }
            pendingSaveBytes = null;
        }
    }

    public void onMidiReceived(String hex) {
        runOnUiThread(() -> webView.evaluateJavascript("window.PTLNativeMidiReceive && window.PTLNativeMidiReceive(" + JSONObject.quote(hex) + ")", null));
    }

    private void showToastJs(String text) {
        runOnUiThread(() -> webView.evaluateJavascript("window.toast && toast(" + JSONObject.quote(text) + ")", null));
    }

    public final class NativeBridge {
        @JavascriptInterface public String scanMidiDevices() { return midi.scanJson(); }
        @JavascriptInterface public String connectMidi(int index) { return midi.connectJson(index); }
        @JavascriptInterface public void disconnectMidi() { midi.disconnect(); }
        @JavascriptInterface public void setWriteArmed(boolean value) { midi.setWriteArmed(value); }
        @JavascriptInterface public void setPersistentArmed(boolean value) { midi.setPersistentArmed(value); }
        @JavascriptInterface public String sendSysEx(String hex, boolean permanent) { return midi.sendSysExJson(hex, permanent); }

        @JavascriptInterface public boolean hasMicrophonePermission() {
            return ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }
        @JavascriptInterface public void requestMicrophonePermission() {
            if (hasMicrophonePermission()) return;
            runOnUiThread(() -> ActivityCompat.requestPermissions(MainActivity.this, new String[]{Manifest.permission.RECORD_AUDIO}, REQ_AUDIO));
        }

        @JavascriptInterface public void vibrate(int millis) {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE); if (v == null) return;
                int ms = Math.max(1, Math.min(80, millis));
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, 42)); else v.vibrate(ms);
            } catch (Exception ignored) { }
        }
        @JavascriptInterface public void setKeepAwake(boolean enabled) {
            runOnUiThread(() -> { if (enabled) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); });
        }
        @JavascriptInterface public void copyText(String text) {
            ClipboardManager c = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (c != null) c.setPrimaryClip(ClipData.newPlainText("Pocket Tone Lab", text == null ? "" : text));
        }
        @JavascriptInterface public void saveBase64File(String name, String mime, String base64) {
            try {
                pendingSaveBytes = Base64.decode(base64, Base64.DEFAULT); pendingSaveMime = mime == null ? "application/octet-stream" : mime;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType(pendingSaveMime); i.putExtra(Intent.EXTRA_TITLE, safeFileName(name));
                runOnUiThread(() -> startActivityForResult(i, REQ_SAVE));
            } catch (Exception e) { showToastJs("Export impossible : " + e.getMessage()); }
        }
        @JavascriptInterface public void shareBase64File(String name, String mime, String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                File dir = new File(getCacheDir(), "shares"); if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, safeFileName(name)); try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                Intent share = new Intent(Intent.ACTION_SEND); share.setType(mime == null ? "application/octet-stream" : mime); share.putExtra(Intent.EXTRA_STREAM, uri); share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(share, "Partager le preset")));
            } catch (Exception e) { showToastJs("Partage impossible : " + e.getMessage()); }
        }
        @JavascriptInterface public String appInfo() {
            try { JSONObject o = new JSONObject();o.put("native",true);o.put("android",Build.VERSION.SDK_INT);o.put("model",Build.MANUFACTURER+" "+Build.MODEL);return o.toString(); }
            catch (Exception e) { return "{}"; }
        }
    }

    private static String safeFileName(String n) {
        String s = n == null ? "preset.prst" : n.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return s.isEmpty() ? "preset.prst" : s;
    }
}
