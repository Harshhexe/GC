// GC Universe · native Higgsedit master · all product pixels from a real iPhone.
export default async ({project}) => {
  const p = await project({dir:'/home/user/gc-launch/project',size:'1920x1080',fps:30,background:'#07060D'});
  const files = ['01-chats','02-chat','03-missed','04-names','05-tea-awards','06-awards','07-stats-1111','08-group-info','09-instructions','10-dna','11-attachments','12-commands','13-wordy','14-wordy-chats','15-gc-ai','16-profile','17-ai-tour','18-tea-tour','19-awards-tour','20-dna-tour','21-polls-tour','22-1111-tour','23-recap-tour','24-themes-tour','25-theme-chooser','26-tools-tray'];
  const a={}; for(const file of files) a[file]=await p.add(`/home/user/gc-launch/media/${file}.jpg`);
  a.logo=await p.add('/home/user/gc-launch/media/logo.png');
  a.wordy=await p.add('/home/user/gc-launch/media/wordy-live.mp4');
  const music=await p.add('/home/user/gc-launch/media/bed.m4a');
  p.cut(music,{at:0,from:0,dur:90});
  const white='#F7F4FF', muted='#ADA6C3';
  const fade=(d)=>[{property:'opacity',keyframes:[{at:0,value:0},{at:.09,value:1},{at:d-.09,value:1},{at:d,value:0}]}];
  const enter=(delay=0)=>[{property:'offsetY',from:64,to:0,at:delay,duration:.7,easing:'house'},{property:'opacity',from:0,to:1,at:delay,duration:.35}];
  const txt=(s,x,y,w,size,color=white,extra={})=><text x={x} y={y} width={w} height={size*3.6} fontFamily="Anton" fontSize={size} color={color} lineHeight={1.08} {...extra}>{s}</text>;
  const body=(s,x,y,w,size=28,color=muted,extra={})=><text x={x} y={y} width={w} height={size*4} fontFamily="Montserrat" fontSize={size} fontWeight={500} color={color} lineHeight={1.4} {...extra}>{s}</text>;
  const phone=(key,x,y,w,d,accent,delay=0)=>{
    const h=w*2.17;
    return <frame x={x} y={y} width={w} height={h} layout="none" motion={{enter:{from:{y:110,scale:.9,opacity:0},at:delay,duration:.8,easing:'house'},settle:{to:{y:-16,scale:1.025},duration:d-1.12-delay,easing:'linear'},exit:{to:{y:-24,opacity:0},duration:.24}}}>
      <rect x={-8} y={-8} width={w+16} height={h+16} radius={w*.15} fill="#191725" strokeColor="#61586E" strokeWidth={2} shadow={{x:0,y:22,blur:45,color:'#000000'}} />
      <media file={a[key]} x={0} y={0} width={w} height={h} fit="fill" radius={w*.14}/>
    </frame>;
  };
  const bg=(accent,d,i)=>[
    <rect width={1920} height={1080} fill={{kind:'linear',angle:25,stops:[{offset:0,color:'#07060D'},{offset:.58,color:'#0D0919'},{offset:1,color:'#211334'}]}}/>,
    <rect x={940} y={-260} width={1200} height={1350} radius={600} fill={{kind:'radial',stops:[{offset:0,color:accent,opacity:.17},{offset:.8,color:accent,opacity:0},{offset:1,color:accent,opacity:0}]}} animate={[{property:'offsetX',from:-80,to:70,duration:d,easing:'linear'}]}/>,
    <rect x={96} y={994} width={1728} height={1} fill="#383044"/>,
    <rect x={96} y={994} width={1728*(i+1)/16} height={2} fill={accent} animate={[{property:'scaleX',from:.85,to:1,duration:d,easing:'linear'}]}/>,
    body('GC UNIVERSE',96,1013,600,17,'#80738E'),body(String(i+1).padStart(2,'0')+' / 16',1690,1013,140,17,'#80738E',{align:'right'})
  ];
  const scenes=[
    {at:0,d:5,k:'01-chats',label:'WELCOME TO GC',title:'YOUR PEOPLE.\nYOUR UNIVERSE.',sub:'One group chat. An entire universe inside.',accent:'#B46CFF',mode:'hero'},
    {at:5,d:6,k:'02-chat',label:'THE CONVERSATION',title:'EVERY CHAT\nHAS A LIFE.',sub:'Replies. Reactions. Voice notes.\nThe everyday chaos, all together.',accent:'#56D5E8',second:'26-tools-tray'},
    {at:11,d:7,k:'17-ai-tour',label:'GC AI',title:'ONE @gc.\nMORE POSSIBLE.',sub:'Ask, summarize, brainstorm and roast.\nAI, right inside the conversation.',accent:'#A877FF',second:'15-gc-ai'},
    {at:18,d:6,k:'03-missed',label:'WHAT I MISSED',title:'MISS THE CHAT.\nNOT THE STORY.',sub:'Catch up with AI recaps, mentions\nand the daily vibe check.',accent:'#54D7E8',second:'23-recap-tour'},
    {at:24,d:5,k:'18-tea-tour',label:'TEA MODE',title:'SPILL IT.\nRELIVE IT.',sub:'A live session for the group’s drama.\nAn AI Tea Report when it ends.',accent:'#32D6AE'},
    {at:29,d:6,k:'06-awards',label:'GC AWARDS',title:'THE CHAT\nHAS LEGENDS.',sub:'Weekly honors. Unforgettable titles.\nYour group gets its moment.',accent:'#EABD50'},
    {at:35,d:5,k:'04-names',label:'GC NAMES',title:'YOUR VIBE.\nYOUR TITLE.',sub:'AI-powered names with a personality\nonly your group could have.',accent:'#F16DCB'},
    {at:40,d:5,k:'10-dna',label:'GC DNA + GROUP STATS',title:'MEET YOUR\nGROUP’S DNA.',sub:'Archetypes, traits and activity.\nDiscover what makes your GC, your GC.',accent:'#49CBDF'},
    {at:45,d:6,k:'wordy',label:'DAILY WORDY',title:'FIVE LETTERS.\nONE MORE TRY.',sub:'A daily word puzzle.\nA little friendly competition.',accent:'#69DCA4',video:true},
    {at:51,d:6,k:'22-1111-tour',label:'11:11 · THE GROUP RITUAL',title:'MAKE\nA WISH.',sub:'A shared moment, twice a day.\nBecause the little rituals matter.',accent:'#FFC55F',large:'11:11'},
    {at:57,d:5,k:'21-polls-tour',label:'INSTANT AI POLLS',title:'LESS DEBATE.\nMORE PLANS.',sub:'Draft with AI. Vote together.\nTurn “what should we do?” into a plan.',accent:'#FA68B8'},
    {at:62,d:6,k:'25-theme-chooser',label:'PERSONAL CHAT THEMES',title:'SAME PEOPLE.\nYOUR AESTHETIC.',sub:'Neon palettes. Glass or solid bubbles.\nA wallpaper that feels like you.',accent:'#B184FF',second:'24-themes-tour'},
    {at:68,d:5,k:'09-instructions',label:'CUSTOM INSTRUCTIONS',title:'TEACH GC\nYOUR WORLD.',sub:'Inside jokes. Nicknames. Group rules.\nGive your AI the context that matters.',accent:'#F6CC70'},
    {at:73,d:6,k:'26-tools-tray',label:'ALL THE DETAILS',title:'SEND IT.\nFIND IT.\nKEEP IT.',sub:'Photos · GIFs · stickers · files\nSearch · pins · shared media · anonymous chat',accent:'#65D0ED',mode:'tools',second:'08-group-info'},
    {at:79,d:5,k:'16-profile',label:'BUILT AROUND YOUR PEOPLE',title:'YOUR GROUP.\nYOUR SPACE.',sub:'Create and join GCs. Make it personal.\nStay close, wherever the chat goes.',accent:'#DA84EC',second:'01-chats'},
    {at:84,d:6,k:'01-chats',label:'THE GC UNIVERSE',title:'MORE THAN\nMESSAGES.',sub:'One group chat. An entire universe inside.',accent:'#B56EFF',mode:'end'}
  ];
  for(let i=0;i<scenes.length;i++){
    const s=scenes[i],d=s.d;
    let nodes=bg(s.accent,d,i);
    if(s.mode==='end'){
      nodes.push(<frame x={0} y={0} width={1920} height={1080} layout="none" animate={[{property:'opacity',from:.16,to:.28,duration:2}]}>{phone('04-names',90,150,300,d,s.accent)}{phone('14-wordy-chats',1530,150,300,d,s.accent)}</frame>);
      nodes.push(<media file={a.logo} x={770} y={60} width={380} height={380} fit="contain" animate={enter()}/>);
      nodes.push(txt(s.title,360,433,1200,136,white,{align:'center',animate:enter(.15)}));
      nodes.push(body(s.sub,390,775,1140,32,'#CABFD9',{align:'center',animate:enter(.4)}));
      nodes.push(body('THE GC UNIVERSE',640,887,640,22,s.accent,{align:'center',letterSpacing:7,animate:enter(.6)}));
    }else{
      let x=1120,w=402,y=88;
      if(s.second){nodes.push(phone(s.second,1462,191,314,d,s.accent,.12)); x=1046;w=382;y=99;}
      if(s.mode==='hero'){x=1220;w=386;nodes.push(txt('GC',910,110,810,620,'#251237',{animate:[{property:'offsetX',from:90,to:0,duration:d,easing:'linear'}]}));}
      if(s.video){
        nodes.push(phone('14-wordy-chats',x,y,w,d,s.accent));
        nodes.push(<frame x={x} y={y} width={w} height={w*2.17} layout="none" motion={{enter:{from:{y:110,scale:.9,opacity:0},duration:.8,easing:'house'},settle:{to:{y:-16,scale:1.025},duration:d-1.12,easing:'linear'},exit:{to:{y:-24,opacity:0},duration:.24}}}><media file={a.wordy} x={0} y={0} width={w} height={w*2.17} fit="fill" radius={w*.14} at={.8} duration={4.3}/></frame>);
      } else nodes.push(phone(s.k,x,y,w,d,s.accent));
      nodes.push(<rect x={98} y={210} width={60} height={4} fill={s.accent} animate={[{property:'scaleX',from:0,to:1,duration:.5,easing:'house'}]}/>);
      nodes.push(body(s.label,97,152,905,23,s.accent,{fontWeight:700,letterSpacing:3,animate:enter(.08)}));
      if(s.large){nodes.push(txt(s.large,92,239,940,228,s.accent,{animate:enter(.15)}));nodes.push(txt(s.title.replace('\n',' '),98,509,880,90,white,{animate:enter(.25)}));}
      else nodes.push(txt(s.title,90,286,930,s.mode==='tools'?114:116,white,{animate:enter(.15)}));
      nodes.push(body(s.sub,99,s.mode==='tools'?743:662,900,29,'#BDB3CD',{animate:enter(.4)}));
      if(s.mode==='hero') nodes.push(<media file={a.logo} x={92} y={800} width={145} height={145} fit="contain" animate={enter(.5)}/>);
      else nodes.push(body('REAL GC · CAPTURED ON iPHONE',99,892,820,17,'#776B89',{letterSpacing:2,animate:enter(.6)}));
    }
    p.compose(<frame width={1920} height={1080} layout="none" animate={fade(d)}>{nodes}</frame>,{at:s.at,dur:d,name:s.label});
  }
  for(const time of [2.5,8,14.5,21,26.5,32,37.5,42.5,48,54,59.5,65,70.5,76,81.5,87]) await p.frame(time,`renders/shot-${String(time).replace('.','-')}.png`);
};
