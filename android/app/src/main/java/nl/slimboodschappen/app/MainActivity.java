package nl.slimboodschappen.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.speech.RecognizerIntent;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Slim Boodschappen: de webapp in een WebView, plus het inlezen van een boodschappenbriefje
 * met de tekstherkenning van Google (ML Kit). Die draait op de telefoon zelf: gratis, zonder account.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/www/index.html";
    private static final int REQ_CAMERA = 11, REQ_GALLERY = 12, REQ_VOICE = 13;
    private static final int MAX_SIDE = 2200;

    private WebView web;
    private TextRecognizer recognizer;
    private Uri cameraUri;
    private int scanToken = 0;
    private boolean pageReady = false;
    private final List<String> pending = new ArrayList<>();

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        if (saved != null) {
            String u = saved.getString("cameraUri");
            if (u != null) cameraUri = Uri.parse(u);
            scanToken = -1; // pagina is opnieuw geladen: token van de oude pagina geldt niet meer
        }
        recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);

        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setSupportZoom(false);
        // volg de lettergrootte van de telefoon (handig voor wie grote letters heeft ingesteld)
        float scale = getResources().getConfiguration().fontScale;
        s.setTextZoom(Math.round(Math.min(1.5f, Math.max(0.85f, scale)) * 100));

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                // links naar supermarkten en folders openen in de gewone browser
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                for (String js : pending) web.evaluateJavascript(js, null);
                pending.clear();
            }
        });
        web.addJavascriptInterface(new Bridge(), "SlimNative");
        web.loadUrl(START);
        handleShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShare(intent);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (cameraUri != null) out.putString("cameraUri", cameraUri.toString());
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(window.slimBack && window.slimBack()) ? 'ja' : 'nee'", value -> {
            if (value != null && value.contains("ja")) return;
            if (web.canGoBack()) web.goBack();
            else finish();
        });
    }

    @Override
    protected void onDestroy() {
        if (recognizer != null) recognizer.close();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /* ---------- koppeling met de webapp ---------- */

    private class Bridge {
        @JavascriptInterface
        public void scan(final String mode, final int token) {
            runOnUiThread(() -> startScan(mode, token));
        }

        /** Boodschappen inspreken met de spraakherkenning van de telefoon. */
        @JavascriptInterface
        public void voice(final int token) {
            runOnUiThread(() -> {
                scanToken = token;
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "nl-NL");
                i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Noem je boodschappen, bijvoorbeeld: melk, brood en twee pakken koffie");
                try {
                    startActivityForResult(i, REQ_VOICE);
                } catch (ActivityNotFoundException e) {
                    sendError("Inspreken werkt niet op deze telefoon. Installeer of activeer de Google-app voor spraak.");
                }
            });
        }

        /** Lijstje delen via WhatsApp, sms, mail enz. */
        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                Intent chooser = Intent.createChooser(i, "Lijstje delen");
                // de app zelf niet als keuze tonen
                chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, new android.content.ComponentName[]{
                        new android.content.ComponentName(MainActivity.this, MainActivity.class)});
                try {
                    startActivity(chooser);
                } catch (ActivityNotFoundException ignored) {
                }
            });
        }
    }

    private void startScan(String mode, int token) {
        scanToken = token;
        if ("camera".equals(mode)) {
            try {
                File dir = new File(getCacheDir(), "scan");
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
                File f = new File(dir, "briefje.jpg");
                cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
                Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                i.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivityForResult(i, REQ_CAMERA);
            } catch (Exception e) {
                sendError("De camera kon niet worden geopend.");
            }
        } else {
            Intent i;
            if (Build.VERSION.SDK_INT >= 33) {
                i = new Intent(MediaStore.ACTION_PICK_IMAGES);
            } else {
                i = new Intent(Intent.ACTION_GET_CONTENT);
                i.setType("image/*");
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i = Intent.createChooser(i, "Kies je boodschappenlijstje");
            }
            try {
                startActivityForResult(i, REQ_GALLERY);
            } catch (ActivityNotFoundException e) {
                sendError("Er is geen app gevonden om een afbeelding te kiezen.");
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_VOICE) {
            ArrayList<String> said = data != null && resultCode == RESULT_OK ? data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) : null;
            if (said == null || said.isEmpty()) { send(state("cancel")); return; }
            JSONObject o = state("done");
            JSONArray lines = new JSONArray();
            lines.put(said.get(0));
            put(o, "lines", lines);
            put(o, "spoken", true);
            send(o);
            return;
        }
        if (requestCode != REQ_CAMERA && requestCode != REQ_GALLERY) return;
        if (resultCode != RESULT_OK) {
            send(state("cancel"));
            return;
        }
        Uri uri = requestCode == REQ_CAMERA ? cameraUri : (data != null ? data.getData() : null);
        if (uri == null) {
            sendError("De foto kon niet worden geopend.");
            return;
        }
        recognize(uri);
    }

    /** Iemand deelt een screenshot of een stukje tekst (bijv. uit Notities) met de app. */
    private void handleShare(Intent intent) {
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            // gedeeld lijstje: https://.../app.html#lijst=...
            String frag = intent.getData().getEncodedFragment();
            if (frag != null) {
                final String js = "window.slimImport && window.slimImport(" + JSONObject.quote(frag) + ")";
                runOnUiThread(() -> { if (pageReady) web.evaluateJavascript(js, null); else pending.add(js); });
            }
            intent.setAction(Intent.ACTION_MAIN);
            return;
        }
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        scanToken = -1;
        String type = intent.getType() == null ? "" : intent.getType();
        if (type.startsWith("text/")) {
            CharSequence t = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (t == null) return;
            JSONObject o = state("done");
            JSONArray lines = new JSONArray();
            for (String l : t.toString().split("\\r?\\n")) lines.put(l);
            put(o, "lines", lines);
            send(o);
        } else if (type.startsWith("image/")) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) recognize(uri);
        }
        intent.setAction(Intent.ACTION_MAIN); // niet nog eens verwerken na draaien van het scherm
    }

    /* ---------- tekstherkenning ---------- */

    private void recognize(final Uri uri) {
        new Thread(() -> {
            Bitmap bmp = loadBitmap(uri);
            if (bmp == null) {
                sendError("De foto kon niet worden geopend. Probeer een andere afbeelding.");
                return;
            }
            JSONObject busy = state("busy");
            put(busy, "thumb", thumb(bmp));
            send(busy);
            final String thumb = thumb(bmp);
            InputImage img = InputImage.fromBitmap(bmp, 0);
            recognizer.process(img)
                    .addOnSuccessListener(text -> {
                        JSONObject o = state("done");
                        put(o, "lines", lines(text));
                        put(o, "thumb", thumb);
                        send(o);
                    })
                    .addOnFailureListener(e -> sendError("Het lezen is niet gelukt. Probeer een scherpere foto met goed licht."));
        }).start();
    }

    /** Alle regels, van boven naar beneden. De volgorde maakt voor een boodschappenlijstje weinig uit. */
    private JSONArray lines(Text text) {
        List<Text.Line> all = new ArrayList<>();
        for (Text.TextBlock b : text.getTextBlocks()) all.addAll(b.getLines());
        Collections.sort(all, (a, b) -> {
            Rect ra = a.getBoundingBox(), rb = b.getBoundingBox();
            if (ra == null || rb == null) return 0;
            int dy = ra.centerY() - rb.centerY();
            int tol = Math.max(8, Math.min(ra.height(), rb.height()) / 2);
            if (Math.abs(dy) > tol) return dy;
            return ra.left - rb.left;
        });
        JSONArray out = new JSONArray();
        for (Text.Line l : all) out.put(l.getText());
        return out;
    }

    private Bitmap loadBitmap(Uri uri) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                BitmapFactory.decodeStream(in, null, o);
            }
            int sample = 1;
            while (Math.max(o.outWidth, o.outHeight) / sample > MAX_SIDE) sample *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options();
            o2.inSampleSize = sample;
            Bitmap bmp;
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                bmp = BitmapFactory.decodeStream(in, null, o2);
            }
            if (bmp == null) return null;
            int rot = 0;
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                if (in != null) {
                    int ori = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                    if (ori == ExifInterface.ORIENTATION_ROTATE_90) rot = 90;
                    else if (ori == ExifInterface.ORIENTATION_ROTATE_180) rot = 180;
                    else if (ori == ExifInterface.ORIENTATION_ROTATE_270) rot = 270;
                }
            } catch (Exception ignored) {
            }
            if (rot != 0) {
                Matrix m = new Matrix();
                m.postRotate(rot);
                Bitmap r = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
                if (r != bmp) bmp.recycle();
                bmp = r;
            }
            return bmp;
        } catch (Exception | OutOfMemoryError e) {
            return null;
        }
    }

    private String thumb(Bitmap bmp) {
        try {
            float k = 200f / Math.max(bmp.getWidth(), bmp.getHeight());
            Bitmap t = Bitmap.createScaledBitmap(bmp, Math.max(1, Math.round(bmp.getWidth() * k)), Math.max(1, Math.round(bmp.getHeight() * k)), true);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            t.compress(Bitmap.CompressFormat.JPEG, 75, bos);
            return "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }

    /* ---------- berichten naar de webapp ---------- */

    private JSONObject state(String s) {
        JSONObject o = new JSONObject();
        put(o, "state", s);
        if (scanToken >= 0) put(o, "token", scanToken);
        return o;
    }

    private void sendError(String msg) {
        JSONObject o = state("error");
        put(o, "message", msg);
        send(o);
    }

    private static void put(JSONObject o, String k, Object v) {
        try {
            o.put(k, v);
        } catch (JSONException ignored) {
        }
    }

    private void send(JSONObject o) {
        final String js = "window.slimNativeScan && window.slimNativeScan(" + o.toString() + ")";
        runOnUiThread(() -> {
            if (pageReady) web.evaluateJavascript(js, null);
            else pending.add(js);
        });
    }
}
