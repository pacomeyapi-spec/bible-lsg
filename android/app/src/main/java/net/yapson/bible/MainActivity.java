package net.yapson.bible;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Bible LSG : la page web intégrée à l'APK (assets/), 100 % hors ligne.
 * Ponts JavaScript :
 *   AndroidTTS.speak(text) / stop() / isAvailable()  — lecture à voix haute (fr-FR) ;
 *       à la fin de chaque phrase, la page reçoit window.bibleTtsDone().
 *   AndroidApp.copy(text) / share(text) / saveFile(nom, contenu) / setBars(couleur, clair).
 */
public class MainActivity extends Activity {
    static final String LOCAL = "file:///android_asset/index.html";
    static final int PICK_FILE = 41;

    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private volatile String lastUtterance = "";
    private int utteranceCounter = 0;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Pas de FLAG_KEEP_SCREEN_ON : l'écran se met en veille normalement pendant la lecture.

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#fbf7ee"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);           // favoris, notes, plans (localStorage)
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);                      // la taille du texte se règle dans l'appli
        s.setMediaPlaybackRequiresUserGesture(true);

        web.addJavascriptInterface(new Tts(), "AndroidTTS");
        web.addJavascriptInterface(new App(), "AndroidApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        setContentView(web);

        initTts();

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(LOCAL);
    }

    // ------------------------------------------------------------ synthèse vocale
    private void initTts() {
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) return;
            int r = tts.setLanguage(Locale.FRANCE);
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                r = tts.setLanguage(Locale.FRENCH);
            }
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) return;
            tts.setSpeechRate(0.92f);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { finished(id); }
                @Override @SuppressWarnings("deprecation") public void onError(String id) { finished(id); }
            });
            ttsReady = true;
        });
    }

    private void finished(String id) {
        if (id == null || !id.equals(lastUtterance)) return;   // phrase interrompue : on ignore
        runOnUiThread(() -> web.evaluateJavascript("window.bibleTtsDone && window.bibleTtsDone()", null));
    }

    class Tts {
        @JavascriptInterface
        public boolean isAvailable() { return ttsReady; }

        @JavascriptInterface
        public void speak(String text) {
            if (!ttsReady || text == null) return;
            String id = "v" + (++utteranceCounter);
            lastUtterance = id;
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);   // minSdk 21
        }

        @JavascriptInterface
        public void stop() {
            lastUtterance = "";
            if (tts != null) tts.stop();
        }
    }

    // ------------------------------------------------------------ copier, partager, enregistrer
    class App {
        @JavascriptInterface
        public void copy(String text) {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Bible LSG", text));
        }

        @JavascriptInterface
        public void share(String text) {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> {
                try { startActivity(Intent.createChooser(i, "Partager")); } catch (Exception ignored) { }
            });
        }

        /** Enregistre un fichier dans Téléchargements ; renvoie l'emplacement, ou "" en cas d'échec. */
        @JavascriptInterface
        public String saveFile(String name, String content) {
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) return "";
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os == null) return "";
                        os.write(bytes);
                    }
                    return "Téléchargements/" + name;
                }
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) return "";
                if (!dir.exists() && !dir.mkdirs()) return "";
                File f = new File(dir, name);
                try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                return f.getAbsolutePath();
            } catch (Exception e) {
                return "";
            }
        }

        /** Couleur des barres système selon le thème de l'appli (clair, sépia, sombre). */
        @JavascriptInterface
        public void setBars(String color, boolean light) {
            runOnUiThread(() -> {
                try {
                    int c = Color.parseColor(color);
                    getWindow().setStatusBarColor(c);
                    getWindow().setNavigationBarColor(c);
                    web.setBackgroundColor(c);
                    if (Build.VERSION.SDK_INT >= 23) {
                        int f = getWindow().getDecorView().getSystemUiVisibility();
                        f = light ? (f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) : (f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
                        if (Build.VERSION.SDK_INT >= 26) {
                            f = light ? (f | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR) : (f & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                        }
                        getWindow().getDecorView().setSystemUiVisibility(f);
                    }
                } catch (Exception ignored) { }
            });
        }
    }

    // ------------------------------------------------------------ navigation et fichiers
    class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            return openOutside(req.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return openOutside(Uri.parse(url));
        }
    }

    /** Liens externes (s'il y en a) : ouverts dans le navigateur, jamais dans l'appli. */
    private boolean openOutside(Uri uri) {
        if ("file".equals(uri.getScheme())) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
        return true;
    }

    /** <input type="file"> : importer une sauvegarde. */
    class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            try {
                startActivityForResult(Intent.createChooser(i, "Choisir la sauvegarde"), PICK_FILE);
            } catch (Exception e) {
                fileCallback = null;
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILE) {
            if (fileCallback != null) {
                Uri[] result = null;
                if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ------------------------------------------------------------ cycle de vie
    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Pendant la lecture à voix haute, la page doit continuer (verset suivant) écran éteint.
        if (lastUtterance.isEmpty()) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        web.destroy();
        super.onDestroy();
    }

    // Retour Android : fermer une fenêtre, revenir à l'écran précédent de l'appli, puis quitter.
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(window.bibleBack && window.bibleBack()) === true", result -> {
            if (!"true".equals(result)) MainActivity.super.onBackPressed();
        });
    }
}
