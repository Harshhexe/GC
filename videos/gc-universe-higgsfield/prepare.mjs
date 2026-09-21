import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.dirname(new URL(import.meta.url).pathname);
const source=path.resolve(root,'../gc-universe/real-captures');
for(const name of fs.readdirSync(source).filter(x=>x.endsWith('.png'))){
 const file=path.join(source,name);
 const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',file],{encoding:'utf8'})).streams[0];
 const w=info.width-16,h=info.height-46;
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-c:v','mjpeg','-i',file,'-vf',`crop=${w}:${h}:8:38`,'-frames:v','1','-q:v','2',path.join(root,'media',name.replace('.png','.jpg'))]);
}
fs.copyFileSync(path.resolve(root,'../../assets/gc_app_logo-transparent.png'),path.join(root,'media/logo.png'));
fs.writeFileSync(path.join(root,'CAPTURE-PROVENANCE.md'),`# GC Universe — real-device source\n\nCaptured through iPhone Mirroring on 18 September 2026 using Computer Use screenshots. Screens are unmodified apart from cropping macOS window chrome. No synthetic app UI. The app's built-in tour is visibly used for AI, Tea, polls and 11:11 explanations; its illustrative examples are not presented as newly generated live results. Wordy video is a chronological frame capture of typing CHATS without submitting a score. No chat messages or polls were sent.\n\nPhone captures: ${fs.readdirSync(source).filter(x=>x.endsWith('.png')).length}. Brand logo: repository assets/gc_app_logo-transparent.png. Music: existing project HeyGen library track, looped and faded for 90 seconds.\n`);
