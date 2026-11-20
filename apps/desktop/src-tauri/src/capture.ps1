# Bounded 16 kHz mono PCM capture. Invoked only after an explicit microphone action.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
public static class JarvisCapture {
 [StructLayout(LayoutKind.Sequential,Pack=2)] struct Format {public ushort tag,channels;public uint rate,average;public ushort block,bits,extra;}
 [StructLayout(LayoutKind.Sequential)] struct Header {public IntPtr data;public uint length,recorded;public IntPtr user;public uint flags,loops;public IntPtr next,reserved;}
 [DllImport("winmm.dll")] static extern uint waveInOpen(out IntPtr h,uint device,ref Format f,IntPtr cb,IntPtr instance,uint flags);
 [DllImport("winmm.dll")] static extern uint waveInPrepareHeader(IntPtr h,IntPtr header,uint size);
 [DllImport("winmm.dll")] static extern uint waveInAddBuffer(IntPtr h,IntPtr header,uint size);
 [DllImport("winmm.dll")] static extern uint waveInStart(IntPtr h);
 [DllImport("winmm.dll")] static extern uint waveInStop(IntPtr h);
 [DllImport("winmm.dll")] static extern uint waveInReset(IntPtr h);
 [DllImport("winmm.dll")] static extern uint waveInUnprepareHeader(IntPtr h,IntPtr header,uint size);
 [DllImport("winmm.dll")] static extern uint waveInClose(IntPtr h);
 static void Check(uint code) {if(code!=0)throw new Exception("Microphone capture unavailable");}
 // Captures 100 ms chunks and stops ~0.8 s after speech ends (energy-based voice activity detection).
 public static void Record(string path) {
  const int chunk=3200,count=80;var f=new Format{tag=1,channels=1,rate=16000,average=32000,block=2,bits=16};IntPtr handle=IntPtr.Zero;
  int size=Marshal.SizeOf(typeof(Header));IntPtr data=Marshal.AllocHGlobal(chunk*count),headers=Marshal.AllocHGlobal(size*count);
  var audio=new MemoryStream();
  try {
   Check(waveInOpen(out handle,uint.MaxValue,ref f,IntPtr.Zero,IntPtr.Zero,0));
   for(int i=0;i<count;i++){IntPtr h=headers+i*size;Marshal.StructureToPtr(new Header{data=data+i*chunk,length=(uint)chunk},h,false);Check(waveInPrepareHeader(handle,h,(uint)size));Check(waveInAddBuffer(handle,h,(uint)size));}
   Check(waveInStart(handle));
   int next=0,silent=0,voiced=0;double noise=-1;bool speaking=false;var started=DateTime.UtcNow;
   while(next<count){
    var hd=(Header)Marshal.PtrToStructure(headers+next*size,typeof(Header));
    if((hd.flags&1)==0){if((DateTime.UtcNow-started).TotalSeconds>16)break;Thread.Sleep(20);continue;}
    int len=(int)hd.recorded;len-=len%2;byte[] buf=new byte[len];Marshal.Copy(data+next*chunk,buf,0,len);audio.Write(buf,0,len);next++;
    double level=0;for(int i=0;i<len;i+=2)level+=Math.Abs((int)BitConverter.ToInt16(buf,i));level/=Math.Max(1,len/2);
    if(next<=3){noise=noise<0?level:Math.Min(noise,level);continue;}
    // Relative to the room's noise floor so quiet laptop microphones still trigger.
    double threshold=Math.Max(35,noise*3.5);
    if(level>threshold){voiced++;silent=0;if(voiced>=2)speaking=true;}else{silent++;if(!speaking)voiced=0;}
    if(speaking&&silent>=6)break;
    if(!speaking&&next>=70)break;
   }
   waveInStop(handle);waveInReset(handle);
   byte[] pcm=audio.ToArray();int length=pcm.Length;
   long total=0;for(int i=0;i+1<length;i+=2)total+=Math.Abs((int)BitConverter.ToInt16(pcm,i));
   // Fallback to the original loudness check so quiet microphones or noisy rooms never drop real speech.
   if(!speaking&&total/Math.Max(1,length/2)>=40)speaking=true;
   if(!speaking||length<3200)throw new Exception("No audible speech captured");
   // Boost quiet recordings so Whisper hears a normal level (gain capped at 16x).
   int peak=1;for(int i=0;i+1<length;i+=2)peak=Math.Max(peak,Math.Abs((int)BitConverter.ToInt16(pcm,i)));
   double gain=Math.Min(16.0,20000.0/peak);
   if(gain>1.2)for(int i=0;i+1<length;i+=2){int v=(int)(BitConverter.ToInt16(pcm,i)*gain);v=Math.Max(-32768,Math.Min(32767,v));pcm[i]=(byte)(v&0xff);pcm[i+1]=(byte)((v>>8)&0xff);}
   using(var writer=new BinaryWriter(File.Create(path))) {writer.Write(System.Text.Encoding.ASCII.GetBytes("RIFF"));writer.Write(36+length);writer.Write(System.Text.Encoding.ASCII.GetBytes("WAVEfmt "));writer.Write(16);writer.Write((short)1);writer.Write((short)1);writer.Write(16000);writer.Write(32000);writer.Write((short)2);writer.Write((short)16);writer.Write(System.Text.Encoding.ASCII.GetBytes("data"));writer.Write(length);writer.Write(pcm);}
  } finally {if(handle!=IntPtr.Zero){waveInReset(handle);for(int i=0;i<count;i++)waveInUnprepareHeader(handle,headers+i*size,(uint)size);waveInClose(handle);}Marshal.FreeHGlobal(headers);Marshal.FreeHGlobal(data);}
 }
}
'@
try { [JarvisCapture]::Record($env:JARVIS_CAPTURE_PATH) } catch { exit 1 }
