package com.nexo.iptv;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.media.AudioFocusRequest;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.text.DateFormat;
import java.util.*;
import java.lang.ref.WeakReference;
import org.json.*;
import org.videolan.libvlc.*;
import org.videolan.libvlc.interfaces.IMedia;
import org.videolan.libvlc.util.VLCVideoLayout;

public class NativePlayerActivity extends Activity {
    static WeakReference<NativePlayerActivity> instance=new WeakReference<>(null);
    LibVLC vlc; final ArrayList<File> subtitleFiles=new ArrayList<>(); final ArrayList<Slot> slots=new ArrayList<>(); JSONArray queue=new JSONArray(); int index=0, selected=0; boolean multi=false, dragging=false, menu=false;
    final Handler handler=new Handler(Looper.getMainLooper()); FrameLayout root; LinearLayout hud; TextView name,epg,clock; ImageView logo; SeekBar seek;
    Button previous,next,toggle; AlertDialog lastDialog; JSONObject program; AudioFocusRequest focusRequest;
    class Slot { MediaPlayer player; VLCVideoLayout layout; JSONObject item; TextView label; boolean preferred=false,resume=false; }
    @Override public void onCreate(Bundle saved){super.onCreate(saved);instance=new WeakReference<>(this);setVolumeControlStream(AudioManager.STREAM_MUSIC);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);immersive();loadSession();}
    void immersive(){getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);}
    int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    TextView text(int size){TextView t=new TextView(this);t.setTextColor(Color.WHITE);t.setTextSize(size);return t;}
    Button button(String label,int id,Runnable action){Button b=new Button(this);b.setText(label);b.setTextColor(0xff9efaff);b.setTextSize(13);b.setAllCaps(false);android.graphics.drawable.StateListDrawable backgrounds=new android.graphics.drawable.StateListDrawable();for(int state:new int[]{android.R.attr.state_focused,android.R.attr.state_pressed,0}){GradientDrawable shape=new GradientDrawable();shape.setColor(state==0?0xff1b142b:0xff153d46);shape.setCornerRadius(dp(6));shape.setStroke(dp(state==0?1:2),state==0?0xff594273:0xff34f5ff);backgrounds.addState(state==0?new int[]{}:new int[]{state},shape);}b.setBackground(backgrounds);b.setId(id);b.setMinWidth(dp(46));b.setMinimumHeight(dp(44));b.setOnClickListener(v->{reveal();action.run();});return b;}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);releaseSlots();loadSession();}
    void loadSession(){
        try{
            String token=getIntent().getStringExtra("session");if(token==null||!token.matches("[a-fA-F0-9-]{36}"))throw new IOException();
            File file=new File(getCacheDir(),"play-"+token+".json");byte[] bytes=java.nio.file.Files.readAllBytes(file.toPath());file.delete();JSONObject config=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
            selected=0;multi="multi".equals(config.optString("mode")); queue=config.optJSONArray(multi?"items":"queue"); if(queue==null)queue=new JSONArray();
            JSONObject item=config.optJSONObject("item");index=0;
            if(!multi){if(item==null)throw new IOException();boolean found=false;for(int i=0;i<queue.length();i++)if(queue.optJSONObject(i)!=null&&item.optString("id").equals(queue.getJSONObject(i).optString("id"))){index=i;found=true;break;}if(!found){queue=new JSONArray();queue.put(item);}}
            program=config.optJSONObject("program");
            vlc=new LibVLC(this,new ArrayList<>(Arrays.asList("--network-caching=1500","--no-video-title-show","--quiet")));
            root=new FrameLayout(this);root.setBackgroundColor(Color.BLACK);setContentView(root);
            GridLayout grid=new GridLayout(this);grid.setColumnCount(multi?2:1);grid.setRowCount(multi?2:1);root.addView(grid,new FrameLayout.LayoutParams(-1,-1));
            for(int i=0;i<(multi?4:1);i++){
                Slot slot=new Slot();slot.item=multi?queue.optJSONObject(i):queue.getJSONObject(index);slot.player=new MediaPlayer(vlc);slot.layout=new VLCVideoLayout(this);
                FrameLayout tile=new FrameLayout(this);tile.setBackgroundColor(Color.BLACK);tile.addView(slot.layout,new FrameLayout.LayoutParams(-1,-1));
                GridLayout.LayoutParams lp=new GridLayout.LayoutParams(GridLayout.spec(multi?i/2:0,1f),GridLayout.spec(multi?i%2:0,1f));lp.width=0;lp.height=0;grid.addView(tile,lp);
                slot.label=text(12);slot.label.setPadding(dp(12),dp(8),dp(12),dp(8));slot.label.setBackgroundColor(0x99090713);tile.addView(slot.label,new FrameLayout.LayoutParams(-1,dp(40),Gravity.TOP));slot.label.setVisibility(multi?View.VISIBLE:View.GONE);
                final int position=i;tile.setOnClickListener(v->{selected=position;exclusiveAudio();refreshInfo();reveal();});slot.player.attachViews(slot.layout,null,false,false);slots.add(slot);
                slot.player.setEventListener(event->{if(event.type==MediaPlayer.Event.Playing){handler.postDelayed(()->preferAudio(slot),350);}if(event.type==MediaPlayer.Event.EncounteredError){runOnUiThread(()->{epg.setText("No se pudo reproducir. Revisa la señal, la conexión o el límite de conexiones de tu cuenta.");reveal();});}});
                if(slot.item!=null)start(slot,slot.item);else slot.label.setText("Sin canal");
            }
            if(multi)for(int i=0;i<slots.size();i++)if(slots.get(i).item!=null){selected=i;break;}
            buildHud();exclusiveAudio();refreshInfo();reveal();handler.post(tick);
            AudioManager audio=(AudioManager)getSystemService(AUDIO_SERVICE);focusRequest=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build()).setOnAudioFocusChangeListener(change->{if(change<0)for(Slot slot:slots)slot.player.pause();}).build();audio.requestAudioFocus(focusRequest);
        }catch(Exception e){new AlertDialog.Builder(this).setMessage("No se pudo abrir la sesión de reproducción.").setPositiveButton("Volver",(d,w)->finish()).setOnCancelListener(d->finish()).show();}
    }
    boolean safeMedia(String value){try{Uri uri=Uri.parse(value);if("http".equals(uri.getScheme())||"https".equals(uri.getScheme()))return true;return "file".equals(uri.getScheme())&&new File(uri.getPath()).getCanonicalPath().startsWith(getCacheDir().getCanonicalPath()+File.separator);}catch(Exception e){return false;}}
    void start(Slot slot,JSONObject item){slot.item=item;slot.preferred=false;String url=item.optString("url");if(!safeMedia(url))return;Media media=new Media(vlc,Uri.parse(url));media.setHWDecoderEnabled(true,false);media.addOption(":network-caching=1500");slot.player.setMedia(media);media.release();slot.player.play();slot.label.setText(item.optString("name","Sin título"));}
    void preferAudio(Slot slot){if(isFinishing()||slot.preferred)return;MediaPlayer.TrackDescription[] tracks=slot.player.getAudioTracks();if(tracks==null||tracks.length==0)return;int audio=-1;IMedia media=slot.player.getMedia();
        if(media!=null){for(int i=0;i<media.getTrackCount();i++){IMedia.Track track=media.getTrack(i);if(track.type==IMedia.Track.Type.Audio&&Arrays.asList("spa","es","esl").contains(track.language)){audio=track.id;break;}}media.release();}
        if(audio<0){for(MediaPlayer.TrackDescription track:tracks)if(track.id>=0){audio=track.id;break;}}
        if(audio>=0){slot.player.setAudioTrack(audio);slot.preferred=true;}slot.player.setSpuTrack(-1);slot.player.setVolume(slots.indexOf(slot)==selected?100:0);
    }
    void buildHud(){
        hud=new LinearLayout(this);hud.setOrientation(LinearLayout.VERTICAL);hud.setPadding(dp(16),dp(12),dp(16),dp(8));GradientDrawable bg=new GradientDrawable();bg.setColor(0xe8090713);bg.setCornerRadius(dp(10));bg.setStroke(dp(1),0x6634f5ff);hud.setBackground(bg);
        FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM);lp.setMargins(dp(16),0,dp(16),dp(16));root.addView(hud,lp);
        LinearLayout info=new LinearLayout(this);info.setGravity(Gravity.CENTER_VERTICAL);logo=new ImageView(this);info.addView(logo,new LinearLayout.LayoutParams(dp(60),dp(48)));name=text(17);name.setPadding(dp(12),0,dp(12),0);info.addView(name,new LinearLayout.LayoutParams(0,-2,1));epg=text(13);epg.setTextColor(0xffddcfee);info.addView(epg,new LinearLayout.LayoutParams(0,-2,1.3f));hud.addView(info);
        LinearLayout timeline=new LinearLayout(this);timeline.setGravity(Gravity.CENTER_VERTICAL);clock=text(11);timeline.addView(clock,new LinearLayout.LayoutParams(dp(112),-2));seek=new SeekBar(this);seek.setId(1010);seek.setMax(1000);timeline.addView(seek,new LinearLayout.LayoutParams(0,dp(36),1));hud.addView(timeline);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onStartTrackingTouch(SeekBar s){dragging=true;reveal();}public void onProgressChanged(SeekBar s,int value,boolean user){if(user)reveal();}public void onStopTrackingTouch(SeekBar s){Slot slot=current();if(slot!=null&&slot.player.getLength()>0)slot.player.setTime(slot.player.getLength()*s.getProgress()/1000);dragging=false;reveal();}});
        LinearLayout controls=new LinearLayout(this);controls.setGravity(Gravity.CENTER);previous=button("❮",1004,()->step(-1));toggle=button("Pausa",1001,()->{Slot slot=current();if(slot!=null){if(slot.player.isPlaying())slot.player.pause();else slot.player.play();}});next=button("❯",1006,()->step(1));
        for(Button b:new Button[]{previous,toggle,next,button("Audio",1002,()->showTracks(0)),button("Subs",1003,()->showTracks(1)),button("Ajustes",1007,this::settings),button("Volver",1008,this::finish)})controls.addView(b,new LinearLayout.LayoutParams(0,dp(48),1));hud.addView(controls);
        toggle.requestFocus();
    }
    Slot current(){return slots.isEmpty()?null:slots.get(Math.min(selected,slots.size()-1));}
    void exclusiveAudio(){for(int i=0;i<slots.size();i++)slots.get(i).player.setVolume(i==selected?100:0);}
    void step(int delta){if(multi||index+delta<0||index+delta>=queue.length())return;index+=delta;try{JSONObject item=queue.getJSONObject(index);program=null;start(slots.get(0),item);refreshInfo();MainActivity.selected(item);}catch(Exception ignored){}}
    void refreshInfo(){if(name==null)return;Slot slot=current();JSONObject item=slot==null?null:slot.item;name.setText(item==null?"Sin canal":item.optString("name"));previous.setEnabled(!multi&&index>0);next.setEnabled(!multi&&index+1<queue.length());
        JSONObject now=program==null?null:program.optJSONObject("current"),after=program==null?null:program.optJSONObject("next");String guide="Sin información";
        if(now!=null){guide="AHORA · "+time(now.optLong("start"))+" — "+time(now.optLong("stop"))+"\n"+now.optString("title");if(after!=null)guide+="\nDespués · "+after.optString("title");}epg.setText(guide);logo.setImageDrawable(null);if(item!=null)loadLogo(item.optString("logo"));
    }
    String time(long ms){return DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(ms));}
    void loadLogo(String address){if(!address.startsWith("http://")&&!address.startsWith("https://"))return;logo.setTag(address);new Thread(()->{try{HttpURLConnection c=(HttpURLConnection)new URL(address).openConnection();c.setConnectTimeout(8000);c.setReadTimeout(8000);try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(out.size()+n>2*1024*1024)throw new IOException();out.write(b,0,n);}byte[] bytes=out.toByteArray();Bitmap bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length);runOnUiThread(()->{if(address.equals(logo.getTag()))logo.setImageBitmap(bitmap);});}finally{c.disconnect();}}catch(Exception ignored){}}).start();}
    static void updateProgram(JSONObject p){NativePlayerActivity a=instance.get();if(a==null||a.multi||a.current()==null||a.current().item==null)return;if(p.optString("id").equals(a.current().item.optString("id"))){a.program=p;a.refreshInfo();}}
    void showTracks(int type){Slot slot=current();if(slot==null)return;MediaPlayer.TrackDescription[] tracks=type==0?slot.player.getAudioTracks():type==1?slot.player.getSpuTracks():slot.player.getVideoTracks();if(tracks==null||tracks.length==0){Toast.makeText(this,"No hay pistas disponibles",Toast.LENGTH_SHORT).show();return;}String[] labels=new String[tracks.length];int selectedTrack=type==0?slot.player.getAudioTrack():type==1?slot.player.getSpuTrack():slot.player.getVideoTrack(),checked=-1;for(int i=0;i<tracks.length;i++){labels[i]=tracks[i].id<0?"Desactivado":tracks[i].name;if(tracks[i].id==selectedTrack)checked=i;}menu=true;lastDialog=new AlertDialog.Builder(this).setTitle(type==0?"Pistas de audio":type==1?"Subtítulos":"Pistas de video").setSingleChoiceItems(labels,checked,(dialog,which)->{int id=tracks[which].id;if(type==0){slot.preferred=true;slot.player.setAudioTrack(id);}else if(type==1)slot.player.setSpuTrack(id);else slot.player.setVideoTrack(id);dialog.dismiss();}).setNegativeButton("Cerrar",null).create();lastDialog.setOnDismissListener(d->{menu=false;reveal();});lastDialog.show();}
    void settings(){menu=true;AlertDialog d=new AlertDialog.Builder(this).setTitle("Ajustes del reproductor").setItems(new String[]{"Pista de video","Cargar SRT / VTT","Volumen"},(dialog,which)->{if(which==0)showTracks(2);else if(which==1)startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE),12);else volume();}).setNegativeButton("Cerrar",null).create();d.setOnDismissListener(dialog->{menu=false;reveal();});d.show();}
    void volume(){Slot slot=current();if(slot==null)return;SeekBar bar=new SeekBar(this);bar.setMax(100);bar.setProgress(slot.player.getVolume());bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onStartTrackingTouch(SeekBar s){}public void onStopTrackingTouch(SeekBar s){}public void onProgressChanged(SeekBar s,int value,boolean user){if(user)slot.player.setVolume(value);}});menu=true;AlertDialog d=new AlertDialog.Builder(this).setTitle("Volumen").setView(bar).setPositiveButton("Listo",null).create();d.setOnDismissListener(dialog->{menu=false;reveal();});d.show();}
    @Override protected void onActivityResult(int request,int result,Intent intent){
        super.onActivityResult(request,result,intent);if(request!=12||result!=RESULT_OK||intent==null||intent.getData()==null||current()==null)return;
        File file=null;
        try{
            String extension=".srt";
            try(android.database.Cursor cursor=getContentResolver().query(intent.getData(),new String[]{android.provider.OpenableColumns.DISPLAY_NAME},null,null,null)){
                if(cursor!=null&&cursor.moveToFirst()&&cursor.getString(0).toLowerCase(Locale.ROOT).endsWith(".vtt"))extension=".vtt";
            }
            file=new File(getCacheDir(),"subtitle-"+UUID.randomUUID()+extension);
            try(InputStream in=getContentResolver().openInputStream(intent.getData());OutputStream out=new FileOutputStream(file)){byte[] b=new byte[8192];int n;long size=0;while((n=in.read(b))!=-1){size+=n;if(size>5*1024*1024)throw new IOException();out.write(b,0,n);}}
            subtitleFiles.add(file);current().player.addSlave(IMedia.Slave.Type.Subtitle,Uri.fromFile(file),true);
        }catch(Exception e){if(file!=null)file.delete();Toast.makeText(this,"No se pudo cargar el subtítulo",Toast.LENGTH_LONG).show();}
    }
    final Runnable hide=()->{if(dragging||menu){reveal();return;}hud.setVisibility(View.INVISIBLE);};
    void reveal(){if(hud==null)return;hud.setVisibility(View.VISIBLE);handler.removeCallbacks(hide);handler.postDelayed(hide,3000);}
    final Runnable tick=new Runnable(){public void run(){Slot slot=current();if(slot!=null&&clock!=null){long length=slot.player.getLength(),position=Math.max(0,slot.player.getTime());clock.setText(clock(position)+" / "+(length>0?clock(length):"EN VIVO"));seek.setEnabled(length>0&&slot.player.isSeekable());if(length>0&&!dragging)seek.setProgress((int)(position*1000/length));toggle.setText(slot.player.isPlaying()?"Pausa":"Play");}handler.postDelayed(this,500);}};
    String clock(long ms){long s=ms/1000;return String.format(Locale.ROOT,"%02d:%02d",s/60,s%60);}
    @Override public boolean dispatchTouchEvent(android.view.MotionEvent event){reveal();return super.dispatchTouchEvent(event);}
    @Override public boolean dispatchGenericMotionEvent(android.view.MotionEvent event){reveal();return super.dispatchGenericMotionEvent(event);}
    @Override public boolean dispatchKeyEvent(KeyEvent event){if(event.getAction()==KeyEvent.ACTION_DOWN){boolean hidden=hud!=null&&hud.getVisibility()!=View.VISIBLE;reveal();if(hidden&&event.getKeyCode()!=KeyEvent.KEYCODE_BACK){toggle.requestFocus();return true;}}return super.dispatchKeyEvent(event);}
    @Override protected void onPause(){super.onPause();for(Slot slot:slots){slot.resume=slot.player.isPlaying();slot.player.pause();}}
    @Override protected void onResume(){super.onResume();immersive();for(Slot slot:slots)if(slot.resume)slot.player.play();}
    void releaseSlots(){handler.removeCallbacksAndMessages(null);for(Slot slot:slots){slot.player.stop();slot.player.detachViews();slot.player.release();}slots.clear();for(File file:subtitleFiles)file.delete();subtitleFiles.clear();if(vlc!=null){vlc.release();vlc=null;}}
    @Override protected void onDestroy(){releaseSlots();if(instance.get()==this)instance.clear();if(focusRequest!=null)((AudioManager)getSystemService(AUDIO_SERVICE)).abandonAudioFocusRequest(focusRequest);super.onDestroy();}
}
