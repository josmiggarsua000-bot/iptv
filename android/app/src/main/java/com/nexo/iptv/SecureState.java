package com.nexo.iptv;
import android.content.Context;
import android.security.keystore.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.io.*;
import java.security.KeyStore;
import java.nio.file.*;
import java.util.UUID;

final class SecureState {
    final File file,temp; String token; CipherOutputStream stream; long size;
    SecureState(Context context){file=new File(context.getFilesDir(),"accounts.enc");temp=new File(context.getFilesDir(),"accounts.new");}
    javax.crypto.SecretKey key() throws Exception {
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
        if(!keys.containsAlias("nexo.accounts.v1")){KeyGenerator g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder("nexo.accounts.v1",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());g.generateKey();}
        return (javax.crypto.SecretKey)keys.getKey("nexo.accounts.v1",null);
    }
    synchronized InputStream read() throws Exception {
        if(!file.exists())return new ByteArrayInputStream("null".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        DataInputStream in=new DataInputStream(new FileInputStream(file));
        try{byte[] magic=new byte[4],iv=new byte[12];in.readFully(magic);in.readFully(iv);if(!"NXA1".equals(new String(magic,java.nio.charset.StandardCharsets.US_ASCII)))throw new IOException();Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,iv));return new CipherInputStream(in,cipher);}catch(Exception e){in.close();throw e;}
    }
    synchronized String begin() throws Exception {close();Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());FileOutputStream out=new FileOutputStream(temp);out.write("NXA1".getBytes(java.nio.charset.StandardCharsets.US_ASCII));out.write(cipher.getIV());stream=new CipherOutputStream(out,cipher);size=0;token=UUID.randomUUID().toString();return token;}
    synchronized void append(String id,byte[] bytes) throws Exception {if(stream==null||!id.equals(token)||size+bytes.length>256L*1024*1024)throw new IOException();stream.write(bytes);size+=bytes.length;}
    synchronized void finish(String id) throws Exception {if(stream==null||!id.equals(token))throw new IOException();stream.close();stream=null;Files.move(temp.toPath(),file.toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);token=null;}
    synchronized void close(){try{if(stream!=null)stream.close();}catch(Exception ignored){}stream=null;token=null;temp.delete();}
}
