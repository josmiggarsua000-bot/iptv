package com.nexo.iptv;

import android.app.Activity;
import android.app.UiModeManager;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.*;
import androidx.webkit.WebViewAssetLoader;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.lang.ref.WeakReference;
import org.json.*;

public class MainActivity extends Activity {
    static WeakReference<MainActivity> instance = new WeakReference<>(null);
    WebView web;
    final ExecutorService workers = Executors.newFixedThreadPool(3);
    final Map<String, File> downloads = new ConcurrentHashMap<>();
    SecureState state;
    ValueCallback<Uri[]> chooser;
    static final String ORIGIN = "https://appassets.androidplatform.net";
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved); instance = new WeakReference<>(this); state = new SecureState(this);
        web = new WebView(this); setContentView(web);
        web.setBackgroundColor(0xff090713);
        web.setOnApplyWindowInsetsListener((v,insets) -> { v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom()); return insets; });
        WebSettings s = web.getSettings(); s.setUseWideViewPort(true); s.setLoadWithOverviewMode(false); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false); s.setAllowContentAccess(true); s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setBuiltInZoomControls(false); s.setSupportZoom(false);
        web.addJavascriptInterface(new Bridge(), "NexoNative");
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !trusted(request.getUrl()); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (trusted(u) && u.getPath().startsWith("/native/")) {
                    try {
                        if (u.getPath().equals("/native/state")) return jsonResponse(state.read());
                        String token = u.getLastPathSegment(); File file = downloads.remove(token);
                        if (u.getPath().startsWith("/native/download/") && file != null) return jsonResponse(new FilterInputStream(new FileInputStream(file)) { @Override public void close() throws IOException { super.close(); file.delete(); } });
                    } catch (Exception e) { return response(500, "Error", new ByteArrayInputStream("{}".getBytes(StandardCharsets.UTF_8))); }
                    return response(404, "Not Found", new ByteArrayInputStream("{}".getBytes(StandardCharsets.UTF_8)));
                }
                return assets.shouldInterceptRequest(u);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null); chooser = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(i, 11); return true; } catch (Exception e) { chooser.onReceiveValue(null); chooser = null; return false; }
            }
        });
        applyDisplayMode(getSharedPreferences("nexo.preferences",MODE_PRIVATE).getString("displayMode",""));
        web.loadUrl(ORIGIN + "/assets/public/index.html");
    }
    static boolean trusted(Uri u) { return "https".equals(u.getScheme()) && "appassets.androidplatform.net".equals(u.getHost()); }
    static WebResourceResponse jsonResponse(InputStream in) { return response(200, "OK", in); }
    static WebResourceResponse response(int status, String reason, InputStream in) {
        Map<String,String> headers = new HashMap<>(); headers.put("Cache-Control", "no-store"); headers.put("X-Content-Type-Options", "nosniff");
        return new WebResourceResponse("application/json", "UTF-8", status, reason, headers, in);
    }
    @Override protected void onActivityResult(int request, int result, Intent intent) { super.onActivityResult(request,result,intent); if (request==11 && chooser!=null) { chooser.onReceiveValue(result==RESULT_OK && intent!=null ? new Uri[]{intent.getData()} : null); chooser=null; } }
    @Override public void onBackPressed() { web.evaluateJavascript("window.nexoAndroidBack ? window.nexoAndroidBack() : false", result -> { if (!"true".equals(result)) MainActivity.super.onBackPressed(); }); }
    void reply(String id, Object result, String error) {
        try { JSONObject o=new JSONObject(); o.put("id",id); o.put("ok",error==null); o.put("result",result==null?JSONObject.NULL:result); if(error!=null)o.put("error",error);
            runOnUiThread(() -> web.evaluateJavascript("window.__nexoReply && window.__nexoReply("+o+")", null));
        } catch(Exception ignored) {}
    }
    void applyDisplayMode(String mode) {
        if ("tv".equals(mode)) {
            setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            web.getSettings().setTextZoom(100);
        } else if ("phone".equals(mode)) {
            setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            web.getSettings().setTextZoom(Math.round(100 * getResources().getConfiguration().fontScale));
        }
    }
    public class Bridge {
        @JavascriptInterface public String getDisplayMode() { return getSharedPreferences("nexo.preferences",MODE_PRIVATE).getString("displayMode",""); }
        @JavascriptInterface public boolean setDisplayMode(String mode) {
            if (!"tv".equals(mode) && !"phone".equals(mode)) return false;
            boolean saved = getSharedPreferences("nexo.preferences",MODE_PRIVATE).edit().putString("displayMode",mode).commit();
            if(saved)runOnUiThread(() -> applyDisplayMode(mode)); return saved;
        }
        @JavascriptInterface public boolean isTv() { UiModeManager m=(UiModeManager)getSystemService(UI_MODE_SERVICE); return m.getCurrentModeType()==Configuration.UI_MODE_TYPE_TELEVISION; }
        @JavascriptInterface public void request(String id, String method, String raw) {
            if(id==null || !id.matches("[a-zA-Z0-9-]{1,64}") || raw==null || raw.length()>32*1024*1024)return;
            workers.execute(() -> { try {
                JSONObject p=new JSONObject(raw); Object result=null;
                switch(method) {
                    case "fetch": result=download(p.getString("url"),p.optString("kind")); break;
                    case "stateBegin": result=state.begin(); break;
                    case "stateFinish": state.finish(p.getString("token")); break;
                    case "play": {
                        String token=UUID.randomUUID().toString(); File file=new File(getCacheDir(),"play-"+token+".json");
                        try(FileOutputStream out=new FileOutputStream(file)){out.write(raw.getBytes(StandardCharsets.UTF_8));}
                        runOnUiThread(() -> startActivity(new Intent(MainActivity.this,NativePlayerActivity.class).putExtra("session",token).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))); break;
                    }
                    case "program": { JSONObject program=p; runOnUiThread(() -> NativePlayerActivity.updateProgram(program)); break; }
                    default: throw new IOException("Método no permitido");
                }
                reply(id,result,null);
            }catch(Exception e){reply(id,null,method.equals("fetch")?"No se pudo descargar del proveedor. Revisa la conexión, el enlace y el estado de tu cuenta.":"No se pudo completar la operación en Android.");} });
        }
        @JavascriptInterface public String stateChunk(String token,String base64) {
            try { if(base64.length()>50000)throw new IOException(); state.append(token,android.util.Base64.decode(base64,android.util.Base64.NO_WRAP)); return "ok"; } catch(Exception e) { return "No se pudo guardar la cuenta de forma protegida."; }
        }
    }
    JSONObject download(String address, String kind) throws Exception {
        URL url=new URL(address); HttpURLConnection connection=null;
        for(int n=0;n<8;n++) {
            if(!Arrays.asList("http","https").contains(url.getProtocol()) || url.getUserInfo()!=null)throw new IOException();
            connection=(HttpURLConnection)url.openConnection(); connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(20000);connection.setReadTimeout(120000);connection.setRequestProperty("Accept-Encoding","gzip");
            int code=connection.getResponseCode();
            if(code>=300&&code<400){String location=connection.getHeaderField("Location");connection.disconnect();if(location==null)throw new IOException();url=new URL(url,location);continue;}
            if(code<200||code>=300){connection.disconnect();throw new IOException();}break;
        }
        if(connection==null || connection.getResponseCode()>=300)throw new IOException();
        String token=UUID.randomUUID().toString();File file=new File(getCacheDir(),"download-"+token);
        try { InputStream body=connection.getInputStream();
            if("gzip".equalsIgnoreCase(connection.getContentEncoding()) || url.getPath().toLowerCase().endsWith(".gz"))body=new java.util.zip.GZIPInputStream(body);
            try(InputStream in=body;OutputStream out=new FileOutputStream(file)){byte[] buffer=new byte[32768];long count=0,limit=("epg".equals(kind)?128L:64L)*1024*1024;int n;
                while((n=in.read(buffer))!=-1){count+=n;if(count>limit)throw new IOException();out.write(buffer,0,n);}}
            downloads.put(token,file);JSONObject result=new JSONObject();result.put("token",token);result.put("url",url.toString());return result;
        }catch(Exception e){file.delete();throw e;}finally{connection.disconnect();}
    }
    static void selected(JSONObject item) { MainActivity a=instance.get(); if(a!=null)a.runOnUiThread(() -> a.web.evaluateJavascript("window.dispatchEvent(new CustomEvent('nexo:selection',{detail:"+item+"}))",null)); }
    @Override protected void onDestroy(){super.onDestroy();if(instance.get()==this)instance.clear(); workers.shutdownNow(); for(File file:downloads.values())file.delete(); state.close();web.destroy();}
}
