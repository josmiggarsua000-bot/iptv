package com.nexo.iptv;
import static org.junit.Assert.*;
import android.content.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.json.*;
import org.videolan.libvlc.*;
import org.videolan.libvlc.interfaces.IMedia;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.net.*;

public class NexoInstrumentedTest {
    Context context(){return InstrumentationRegistry.getInstrumentation().getTargetContext();}
    void waitFor(Callable<Boolean> condition) throws Exception {long end=System.currentTimeMillis()+25000;while(System.currentTimeMillis()<end){if(condition.call())return;Thread.sleep(150);}fail("La condición no se cumplió dentro del plazo");}
    String js(MainActivity activity,String expression) throws Exception {CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();InstrumentationRegistry.getInstrumentation().runOnMainSync(()->activity.web.evaluateJavascript(expression,value->{result.set(value);done.countDown();}));assertTrue(done.await(10,TimeUnit.SECONDS));return result.get();}
    @Test public void encryptedAccountsRoundTrip() throws Exception {
        SecureState state=new SecureState(context());String secret="clave-ficticia-ñ-🔐";String json="{\"accounts\":[{\"password\":\""+secret+"\"}],\"favorites\":{}}";
        String token=state.begin();byte[] bytes=json.getBytes(StandardCharsets.UTF_8);state.append(token,Arrays.copyOfRange(bytes,0,11));state.append(token,Arrays.copyOfRange(bytes,11,bytes.length));state.finish(token);
        String stored=new String(java.nio.file.Files.readAllBytes(state.file.toPath()),StandardCharsets.ISO_8859_1);assertFalse(stored.contains("clave-ficticia"));
        ByteArrayOutputStream result=new ByteArrayOutputStream();try(InputStream in=state.read()){byte[] b=new byte[512];int n;while((n=in.read(b))!=-1)result.write(b,0,n);}assertEquals(json,result.toString("UTF-8"));state.file.delete();state.close();
    }
    @Test public void webInterfaceLoadsEmptyAndUsesNativeBridge() throws Exception {
        context().getSharedPreferences("nexo.preferences",Context.MODE_PRIVATE).edit().clear().commit();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            AtomicReference<MainActivity> activity=new AtomicReference<>();scenario.onActivity(activity::set);
            waitFor(()->"true".equals(js(activity.get(),"!!document.querySelector('#picker-add')?.onclick")));
            assertEquals("true",js(activity.get(),"!!window.androidHost && document.documentElement.classList.contains('android-app')"));
            waitFor(()->"true".equals(js(activity.get(),"!!document.querySelector('#display-mode-dialog')?.open")));
            js(activity.get(),"window.__keys=[];document.addEventListener('keydown',e=>window.__keys.push({key:e.key,code:e.code,focus:document.activeElement.dataset.displayMode}),true);document.querySelector('[data-display-mode=phone]').focus()");
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_LEFT);
            assertEquals("\"tv\"",js(activity.get(),"document.activeElement.dataset.displayMode"));
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_CENTER);
            try { waitFor(()->"true".equals(js(activity.get(),"document.documentElement.classList.contains('android-tv') && !document.querySelector('#display-mode-dialog').open"))); } catch(AssertionError failure) {
                fail("TV choice: "+js(activity.get(),"JSON.stringify({classes:document.documentElement.className,open:document.querySelector('#display-mode-dialog').open,error:document.querySelector('#display-mode-error').textContent,mode:window.NexoNative.getDisplayMode(),keys:window.__keys})"));
            }
            assertEquals("tv",context().getSharedPreferences("nexo.preferences",Context.MODE_PRIVATE).getString("displayMode",""));
            assertEquals("true",js(activity.get(),"document.querySelector('#android-display-settings').click();document.querySelector('[data-display-mode=phone]').click();document.documentElement.classList.contains('android-phone')"));
            assertEquals("phone",context().getSharedPreferences("nexo.preferences",Context.MODE_PRIVATE).getString("displayMode",""));
            scenario.recreate();scenario.onActivity(activity::set);
            waitFor(()->"true".equals(js(activity.get(),"!!document.querySelector('#picker-add')?.onclick && !document.querySelector('#startup-intro')")));
            assertEquals("false",js(activity.get(),"document.querySelector('#display-mode-dialog').open"));
            assertEquals("true",js(activity.get(),"document.documentElement.classList.contains('android-phone')"));
            assertEquals("0",js(activity.get(),"document.querySelectorAll('.account-row').length"));
            assertEquals("\"Nexo IPTV\"",js(activity.get(),"document.title"));
            assertEquals("true",js(activity.get(),"document.querySelector('#picker-add').click(); document.querySelector('#account-dialog').open"));
            assertEquals("true",js(activity.get(),"window.nexoAndroidBack()"));
            js(activity.get(),"window.__saved=false;window.desktop.saveState({accounts:[],favorites:{},marker:'Prueba-ñ-🔐'}).then(()=>window.__saved=true);true");
            waitFor(()->"true".equals(js(activity.get(),"window.__saved")));
            js(activity.get(),"window.__read=false;window.desktop.readState().then(s=>window.__read=s.marker==='Prueba-ñ-🔐');true");
            waitFor(()->"true".equals(js(activity.get(),"window.__read")));
            try(ServerSocket server=new ServerSocket(0)){
                Thread serve=new Thread(()->{try(Socket socket=server.accept()){BufferedReader reader=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.UTF_8));String line;while((line=reader.readLine())!=null&&!line.isEmpty()){}byte[] body="#EXTM3U\n#EXTINF:-1,Prueba\nhttp://127.0.0.1/stream.ts".getBytes(StandardCharsets.UTF_8);OutputStream out=socket.getOutputStream();out.write(("HTTP/1.1 200 OK\r\nContent-Length: "+body.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(body);out.flush();}catch(Exception ignored){}});serve.setDaemon(true);serve.start();
                js(activity.get(),"window.__fetched=false;window.desktop.fetchPlaylist('http://127.0.0.1:"+server.getLocalPort()+"/list').then(s=>window.__fetched=s.text.startsWith('#EXTM3U'));true");
                waitFor(()->"true".equals(js(activity.get(),"window.__fetched")));
            }
            assertEquals("true",js(activity.get(),"document.documentElement.classList.add('android-tv');document.activeElement.blur();document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));document.activeElement.id==='picker-add'"));
            assertEquals("true",js(activity.get(),"document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));document.querySelector('#account-dialog').open"));
            js(activity.get(),"window.nexoAndroidBack()");

        }
    }
    @Test public void tvRemoteSelectsCardsAndHoldsOkForFavorites() throws Exception {
        context().getSharedPreferences("nexo.preferences",Context.MODE_PRIVATE).edit().putString("displayMode","tv").commit();
        SecureState state=new SecureState(context());
        JSONObject item=new JSONObject().put("id","remote-channel").put("name","Canal remoto").put("kind","live").put("group","Prueba").put("url","https://example.invalid/live/1.ts");
        JSONObject account=new JSONObject().put("id","remote").put("name","Prueba control").put("type","m3u").put("config",new JSONObject().put("refreshOnEntry",false)).put("items",new JSONArray().put(item));
        JSONObject data=new JSONObject().put("accounts",new JSONArray().put(account)).put("favorites",new JSONObject());
        String token=state.begin();state.append(token,data.toString().getBytes(StandardCharsets.UTF_8));state.finish(token);state.close();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            AtomicReference<MainActivity> a=new AtomicReference<>();scenario.onActivity(a::set);
            waitFor(()->"true".equals(js(a.get(),"!!document.querySelector('.account-open') && !document.querySelector('#startup-intro')")));
            js(a.get(),"document.querySelector('.account-open').focus()");
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_CENTER);
            waitFor(()->"true".equals(js(a.get(),"!document.querySelector('.app').hidden")));
            js(a.get(),"document.querySelector('[data-open=live]').focus();window.__remotePlayed=false;window.androidHost.play=async()=>{window.__remotePlayed=true;}");
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_CENTER);
            waitFor(()->"true".equals(js(a.get(),"!document.querySelector('#library-view').hidden")));
            js(a.get(),"document.querySelector('.content-play').focus()");
            waitFor(()->"true".equals(js(a.get(),"document.querySelector('.favorite').tabIndex===-1 && getComputedStyle(document.querySelector('.content-card')).outlineStyle!=='none'")));
            InstrumentationRegistry.getInstrumentation().sendKeySync(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_DPAD_CENTER));
            Thread.sleep(900);
            InstrumentationRegistry.getInstrumentation().sendKeySync(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP,android.view.KeyEvent.KEYCODE_DPAD_CENTER));
            waitFor(()->"true".equals(js(a.get(),"document.querySelector('.favorite').getAttribute('aria-pressed')==='true'")));
            assertEquals("false",js(a.get(),"window.__remotePlayed"));
            waitFor(()->"true".equals(js(a.get(),"document.activeElement.matches('.content-play')")));
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_CENTER);
            waitFor(()->"true".equals(js(a.get(),"window.__remotePlayed")));
            js(a.get(),"document.querySelector('#android-display-settings').click();document.querySelector('[data-display-mode=phone]').click()");
            scenario.onActivity(activity->activity.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
            waitFor(()->"true".equals(js(a.get(),"innerHeight>innerWidth && document.documentElement.classList.contains('android-phone')")));
            for(String section:new String[]{"live","movie","series","epg"}){
                js(a.get(),"document.querySelector('[data-view=home]').click();document.querySelector('[data-open="+section+"]').click()");
                waitFor(()->"true".equals(js(a.get(),"document.querySelector('main').getBoundingClientRect().top<190 && document.querySelector('.sidebar').getBoundingClientRect().height<180 && document.documentElement.scrollWidth<=innerWidth+1")));
            }
            scenario.onActivity(activity->{int[] location=new int[2];activity.web.getLocationOnScreen(location);assertTrue("Content must be below the status bar",location[1]>0);});
        } finally {new File(context().getFilesDir(),"accounts.enc").delete();}
    }
    Intent playback(boolean multi) throws Exception {
        File fixture=new File(context().getCacheDir(),"native-test.mkv");try(InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("dual-ac3-subtitles.mkv");OutputStream out=new FileOutputStream(fixture)){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}
        JSONObject item=new JSONObject().put("id","fixture").put("name","Prueba AC3").put("kind","movie").put("url",android.net.Uri.fromFile(fixture).toString());
        JSONArray items=new JSONArray();for(int i=0;i<(multi?4:1);i++)items.put(item);JSONObject config=new JSONObject().put("mode",multi?"multi":"single").put("queue",items).put("items",items).put("item",item);
        String token=UUID.randomUUID().toString();try(FileOutputStream out=new FileOutputStream(new File(context().getCacheDir(),"play-"+token+".json"))){out.write(config.toString().getBytes(StandardCharsets.UTF_8));}
        return new Intent(context(),NativePlayerActivity.class).putExtra("session",token).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }
    @Test public void nativeAc3AudioSelectionAndEmbeddedSubtitles() throws Exception {
        context().getSharedPreferences("nexo.preferences",Context.MODE_PRIVATE).edit().putString("displayMode","tv").commit();
        try(ActivityScenario<NativePlayerActivity> scenario=ActivityScenario.launch(playback(false))){
            AtomicReference<NativePlayerActivity> a=new AtomicReference<>();scenario.onActivity(a::set);
            waitFor(()->a.get().current()!=null && a.get().current().player.getTime()>500 && a.get().current().player.getAudioTracksCount()>=2);
            MediaPlayer player=a.get().current().player;IMedia media=player.getMedia();assertTrue(media.getStats().decodedAudio>0);int english=-1;for(int i=0;i<media.getTrackCount();i++){IMedia.Track track=media.getTrack(i);if(track.type==IMedia.Track.Type.Audio&&"eng".equals(track.language))english=track.id;}media.release();assertTrue(english>=0);
            final int selected=english;scenario.onActivity(activity->{activity.showTracks(0);MediaPlayer.TrackDescription[] tracks=player.getAudioTracks();for(int i=0;i<tracks.length;i++)if(tracks[i].id==selected){activity.lastDialog.getListView().performItemClick(null,i,i);break;}});
            waitFor(()->player.getAudioTrack()==selected);
            waitFor(()->player.getSpuTracks()!=null && player.getSpuTracks().length>=2);
            scenario.onActivity(activity->{MediaPlayer.TrackDescription[] tracks=player.getSpuTracks();for(int i=0;i<tracks.length;i++)if(tracks[i].id>=0){player.setSpuTrack(tracks[i].id);break;}});
            waitFor(()->player.getSpuTrack()>=0);
            scenario.onActivity(activity->{player.pause();player.setTime(4000);});waitFor(()->player.getTime()>=3500);
            scenario.onActivity(activity->{
                assertTrue(activity.tvMode);
                assertTrue(activity.hud.getLeft()>0 && activity.hud.getRight()<activity.root.getWidth());
                try { activity.queue.put(new JSONObject(activity.current().item.toString()).put("id","fixture-next").put("name","Canal siguiente")); } catch(JSONException e){throw new AssertionError(e);}
                activity.hide.run();assertEquals(android.view.View.INVISIBLE,activity.hud.getVisibility());
                activity.dispatchKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_DPAD_CENTER));
                activity.dispatchKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP,android.view.KeyEvent.KEYCODE_DPAD_CENTER));
                assertEquals(android.view.View.VISIBLE,activity.hud.getVisibility());assertTrue(activity.toggle.hasFocus());
                activity.dispatchKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_CHANNEL_UP));
                assertEquals(1,activity.index);assertEquals("Canal siguiente",activity.name.getText().toString());
                activity.dispatchKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_CHANNEL_DOWN));assertEquals(0,activity.index);
            });
        }
    }
    @Test public void fourNativeScreensWithExclusiveAudio() throws Exception {
        try(ActivityScenario<NativePlayerActivity> scenario=ActivityScenario.launch(playback(true))){AtomicReference<NativePlayerActivity>a=new AtomicReference<>();scenario.onActivity(a::set);waitFor(()->a.get().slots.size()==4&&a.get().slots.stream().allMatch(slot->slot.player.getTime()>700));assertEquals(100,a.get().slots.get(0).player.getVolume());assertEquals(0,a.get().slots.get(1).player.getVolume());scenario.onActivity(activity->{activity.selected=1;activity.exclusiveAudio();});assertEquals(0,a.get().slots.get(0).player.getVolume());assertEquals(100,a.get().slots.get(1).player.getVolume());}
    }
}
