import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import "./App.css";

/* ═══════════════════════════════════════════════════
   ⚙️  SUPABASE CONFIG
   NOTE: requires `pin TEXT` and `paid BOOLEAN DEFAULT false` columns in the entries table
   ═══════════════════════════════════════════════════ */
const SUPABASE_URL = "https://xewcjyjmgjqbvjbjhjkv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_uRrFJUQoU5GoYg5umXc7bg_st0jeRJV";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const YEAR = 2026;
const API_URL = `https://ncaa-api.henrygd.me/brackets/icehockey-men/d1/${YEAR}`;
const POINTS = [0,1,1,1,1,1,1,1,1,2,2,2,2,4,4,8];
const MAX_PTS = POINTS.reduce((a,b)=>a+b,0);
const ROUND_LABEL = g => g<=8?"First Round":g<=12?"Quarterfinals":g<=14?"Semifinals":"Championship";
const POS_TO_GAME = {101:1,102:2,103:3,104:4,105:5,106:6,107:7,108:8,201:9,202:10,203:11,204:12,301:13,302:14,401:15};

const BRACKET = {
  1:{top:"Michigan",     bottom:"Bentley",      seedTop:1, seedBottom:16},
  2:{top:"Minn. Duluth", bottom:"Penn St.",      seedTop:8, seedBottom:9},
  3:{top:"Western Mich.",bottom:"Minnesota St.", seedTop:4, seedBottom:13},
  4:{top:"Denver",       bottom:"Cornell",       seedTop:5, seedBottom:12},
  5:{top:"Michigan St.", bottom:"UConn",         seedTop:3, seedBottom:14},
  6:{top:"Dartmouth",    bottom:"Wisconsin",     seedTop:6, seedBottom:11},
  7:{top:"North Dakota", bottom:"Merrimack",     seedTop:2, seedBottom:15},
  8:{top:"Providence",   bottom:"Quinnipiac",    seedTop:7, seedBottom:10},
  9:{from:[1,2]}, 10:{from:[3,4]}, 11:{from:[5,6]}, 12:{from:[7,8]},
  13:{from:[9,10]}, 14:{from:[11,12]}, 15:{from:[13,14]},
};

const LOGOS = {
  "Michigan":      "https://i.turner.ncaa.com/sites/default/files/images/logos/schools/bgd/michigan.svg",
  "Bentley":       "https://i.turner.ncaa.com/sites/default/files/images/logos/schools/bgd/bentley.svg",
  "Minn. Duluth":  "https://a.espncdn.com/i/teamlogos/ncaa/500/2309.png",
  "Penn St.":      "https://i.turner.ncaa.com/sites/default/files/images/logos/schools/bgd/penn-st.svg",
  "Western Mich.": "https://a.espncdn.com/i/teamlogos/ncaa/500/2711.png",
  "Minnesota St.": "https://a.espncdn.com/i/teamlogos/ncaa/500/2364.png",
  "Denver":        "https://i.turner.ncaa.com/sites/default/files/images/logos/schools/bgd/denver.svg",
  "Cornell":       "https://i.turner.ncaa.com/sites/default/files/images/logos/schools/bgd/cornell.svg",
  "Michigan St.":  "https://i.turner.ncaa.com/sites/default/files/images/logos/schools/bgd/michigan-st.svg",
  "UConn":         "https://a.espncdn.com/i/teamlogos/ncaa/500/41.png",
  "Dartmouth":     "https://i.turner.ncaa.com/sites/default/files/images/logos/schools/bgd/dartmouth.svg",
  "Wisconsin":     "https://i.turner.ncaa.com/sites/default/files/images/logos/schools/bgd/wisconsin.svg",
  "North Dakota":  "https://i.turner.ncaa.com/sites/default/files/images/logos/schools/bgd/north-dakota.svg",
  "Merrimack":     "https://i.turner.ncaa.com/sites/default/files/images/logos/schools/bgd/merrimack.svg",
  "Providence":    "https://i.turner.ncaa.com/sites/default/files/images/logos/schools/bgd/providence.svg",
  "Quinnipiac":    "https://i.turner.ncaa.com/sites/default/files/images/logos/schools/bgd/quinnipiac.svg",
};

/* ═══════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════ */
function norm(s){return(s||"").trim().toLowerCase();}
function eq(a,b){return norm(a)===norm(b);}
function generatePin(){return String(Math.floor(1000+Math.random()*9000));}

function cascade(picks){
  const p={...picks};
  for(let g=9;g<=15;g++){
    const[f1,f2]=BRACKET[g].from;
    if(p[g]&&p[g]!==p[f1]&&p[g]!==p[f2]) p[g]=null;
  }
  return p;
}

function isComplete(picks){for(let g=1;g<=15;g++){if(!picks[g])return false;}return true;}

function parseAPI(data){
  const r={};
  if(!data?.championships?.[0]?.games)return r;
  for(const gm of data.championships[0].games){
    const g=POS_TO_GAME[gm.bracketPositionId];
    if(!g)continue;
    const w=gm.teams?.find(t=>t.isWinner);
    r[g]={
      state:gm.gameState, period:gm.currentPeriod||"",
      final:gm.gameState==="F", live:gm.gameState==="I",
      teams:gm.teams?.map(t=>t.nameShort)||[],
      scores:gm.teams?.map(t=>t.score)||[],
      winner:w?w.nameShort:null,
      startDate:gm.startDate, startTime:gm.startTime,
    };
  }
  return r;
}

function scoreEntry(entry,results){
  let total=0,max=0; const d={};
  for(let g=1;g<=15;g++){
    const pick=entry.picks[g],r=results[g],pts=POINTS[g];
    if(r?.winner){const c=eq(pick,r.winner);d[g]={pick,correct:c,pts:c?pts:0};if(c)total+=pts;}
    else{d[g]={pick,correct:null,pts:0};max+=pts;}
  }
  return{total,maxPossible:total+max,details:d};
}

function getEliminated(results){
  const s=new Set();
  for(let g=1;g<=15;g++){
    const r=results[g];
    if(r?.winner&&r.teams?.length===2)r.teams.forEach(t=>{if(!eq(t,r.winner))s.add(norm(t));});
  }
  return s;
}

/* ═══════════════════════════════════════════════════
   SUPABASE DATA FUNCTIONS
   ═══════════════════════════════════════════════════ */
async function loadEntries(){
  try{
    const{data,error}=await supabase.from("entries").select("name,email,tiebreak,picks,submitted_at");
    if(error)throw error;
    return(data||[]).map(row=>({name:row.name,email:row.email||"",tiebreak:row.tiebreak,picks:row.picks,submittedAt:row.submitted_at}));
  }catch(e){console.error("loadEntries error",e);return[];}
}

async function loadEntriesWithPins(){
  try{
    // Try with paid column first, fall back without it
    let{data,error}=await supabase.from("entries").select("name,email,tiebreak,picks,submitted_at,pin,paid");
    if(error){
      ({data,error}=await supabase.from("entries").select("name,email,tiebreak,picks,submitted_at,pin"));
      if(error)throw error;
    }
    return(data||[]).map(row=>({name:row.name,email:row.email||"",tiebreak:row.tiebreak,picks:row.picks,submittedAt:row.submitted_at,pin:row.pin||null,paid:!!row.paid}));
  }catch(e){console.error("loadEntriesWithPins error",e);return[];}
}

async function saveEntry(entry){
  try{
    const{error}=await supabase.from("entries").upsert(
      {name:entry.name,email:entry.email||null,tiebreak:entry.tiebreak,picks:entry.picks,submitted_at:entry.submittedAt,pin:entry.pin},
      {onConflict:"name"}
    );
    if(error)throw error; return true;
  }catch(e){console.error("saveEntry error",e);return false;}
}

// Returns full entry data if name+pin match, null otherwise
async function verifyEntryPin(name,pin){
  try{
    const{data,error}=await supabase.from("entries")
      .select("name,email,tiebreak,picks,submitted_at")
      .eq("name",name).eq("pin",pin).single();
    if(error||!data)return null;
    return{name:data.name,email:data.email||"",tiebreak:data.tiebreak,picks:data.picks,submittedAt:data.submitted_at};
  }catch{return null;}
}

async function resetEntryPin(name){
  const pin=generatePin();
  try{
    const{error}=await supabase.from("entries").update({pin}).eq("name",name);
    if(error)throw error; return pin;
  }catch(e){console.error("resetEntryPin error",e);return null;}
}

async function deleteEntry(name){
  try{
    const{error}=await supabase.from("entries").delete().eq("name",name);
    if(error)throw error; return true;
  }catch(e){console.error("deleteEntry error",e);return false;}
}

async function updatePaidStatus(name,paid){
  try{
    const{error}=await supabase.from("entries").update({paid}).eq("name",name);
    if(error)throw error; return true;
  }catch(e){console.error("updatePaidStatus error",e);return false;}
}

/* ═══════════════════════════════════════════════════
   DESIGN TOKENS — VINTAGE HOCKEY PROGRAM
   ═══════════════════════════════════════════════════ */
const C = {
  bg:"#ede8dc",
  bgCard:"#faf7f1",
  bgCardAlt:"#f5f0e6",
  bgInset:"#f0ebe0",
  border:"#c4b89a",
  borderAccent:"#cc2020",

  text:"#12100e",
  textMid:"#5c4030",
  textLight:"#9a7a62",

  red:"#cc2020",
  redDark:"#8a1010",
  redBg:"rgba(204,32,32,0.08)",
  redBorder:"rgba(204,32,32,0.3)",

  navy:"#1a2a4a",
  navyBg:"rgba(26,42,74,0.06)",
  navyBorder:"rgba(26,42,74,0.25)",

  green:"#1a7a40",
  greenBg:"rgba(26,122,64,0.08)",
  greenBorder:"rgba(26,122,64,0.3)",

  gold:"#b86c10",
  goldBg:"rgba(184,108,16,0.1)",

  shadow:"0 1px 3px rgba(0,0,0,0.1), 0 4px 14px rgba(0,0,0,0.06)",
  shadowLg:"0 4px 20px rgba(0,0,0,0.15)",
};

const FONTS = {
  display:"'Bebas Neue', impact, sans-serif",
  body:"'Barlow Condensed', 'Barlow', sans-serif",
  mono:"'Share Tech Mono', 'Courier New', monospace",
};

/* ═══════════════════════════════════════════════════
   GLOBAL STYLES (font link only — classes in App.css)
   ═══════════════════════════════════════════════════ */
const GlobalStyles = () => (
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@300;400;500;600;700&family=Barlow:wght@400;500;600&family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
);

/* ═══════════════════════════════════════════════════
   LOGO COMPONENT
   ═══════════════════════════════════════════════════ */
function TeamLogo({team, size=20, style={}}){
  const[err,setErr]=useState(false);
  const src=LOGOS[team];
  if(!src||err) return <span style={{width:size,height:size,display:"inline-block",...style}}/>;
  return <img src={src} alt={team} width={size} height={size} onError={()=>setErr(true)} style={{objectFit:"contain",flexShrink:0,...style}}/>;
}

/* ═══════════════════════════════════════════════════
   SHARED UI
   ═══════════════════════════════════════════════════ */
function Card({children,style={},onClick,onMouseEnter,onMouseLeave}){
  return <div className="retro-card" style={{padding:16,...style}} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>{children}</div>;
}

function SectionHeader({children,style={}}){
  return(
    <div className="section-rule" style={{marginBottom:16,...style}}>
      <span style={{fontFamily:FONTS.display,fontSize:20,color:C.navy,letterSpacing:"3px",whiteSpace:"nowrap"}}>{children}</span>
    </div>
  );
}

function Fld({label,flex,children}){
  return(
    <div style={{flex}}>
      <label style={{fontSize:10,color:C.textLight,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",display:"block",marginBottom:5,fontFamily:FONTS.body}}>{label}</label>
      {children}
    </div>
  );
}

function ScoringKey(){
  return(
    <Card style={{padding:"12px 20px",display:"flex",gap:24,flexWrap:"wrap",alignItems:"center"}}>
      <span style={{fontFamily:FONTS.display,fontSize:16,color:C.navy,letterSpacing:"3px"}}>SCORING KEY</span>
      {[{r:"1ST RD",p:1},{r:"QUARTERS",p:2},{r:"SEMIS",p:4},{r:"FINAL",p:8}].map(x=>(
        <div key={x.r} style={{display:"flex",alignItems:"baseline",gap:5}}>
          <span style={{fontFamily:FONTS.mono,fontSize:22,color:C.red,fontWeight:700}}>{x.p}</span>
          <span style={{fontSize:11,color:C.textMid,fontFamily:FONTS.body,fontWeight:700,letterSpacing:"1.5px"}}>{x.r}</span>
        </div>
      ))}
      <span style={{fontFamily:FONTS.mono,fontSize:13,color:C.navy,marginLeft:"auto",fontWeight:700,letterSpacing:2}}>{MAX_PTS} MAX PTS</span>
    </Card>
  );
}

const primaryBtn = {
  background:C.red,
  color:"#faf7f1",
  border:"none",
  borderRadius:1,
  padding:"13px 36px",
  fontSize:16,
  fontFamily:FONTS.display,
  cursor:"pointer",
  letterSpacing:"3px",
  boxShadow:"0 2px 8px rgba(204,32,32,0.3), 2px 2px 0 rgba(0,0,0,0.15)",
  transition:"all 0.15s",
};

const secondaryBtn = {
  background:"transparent",
  color:C.navy,
  border:`1px solid ${C.navyBorder}`,
  borderRadius:1,
  padding:"8px 16px",
  fontSize:12,
  fontFamily:FONTS.body,
  cursor:"pointer",
  fontWeight:700,
  letterSpacing:"1.5px",
  transition:"all 0.15s",
};

const navyBtn = {
  background:C.navy,
  color:"#faf7f1",
  border:"none",
  borderRadius:1,
  padding:"11px 28px",
  fontSize:15,
  fontFamily:FONTS.display,
  cursor:"pointer",
  letterSpacing:"2px",
  boxShadow:"2px 2px 0 rgba(0,0,0,0.2)",
  transition:"all 0.15s",
};

/* ═══════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════ */
export default function App(){
  const[view,setView]=useState("bracket");
  const[entries,setEntries]=useState([]);
  const[results,setResults]=useState({});
  const[loading,setLoading]=useState(true);
  const[lastFetch,setLastFetch]=useState(null);

  const isAdmin=useMemo(()=>{
    try{return new URLSearchParams(window.location.search).get("admin")==="true";}
    catch{return false;}
  },[]);

  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const[ents,res]=await Promise.all([
        loadEntries(),
        fetch(API_URL).then(r=>r.json()).then(parseAPI).catch(()=>({})),
      ]);
      setEntries(ents); setResults(res); setLastFetch(new Date());
    }catch{}finally{setLoading(false);}
  },[]);

  useEffect(()=>{refresh();},[refresh]);

  const started=Object.values(results).some(r=>r.final||r.live);
  const completed=Object.values(results).filter(r=>r.final).length;
  const anyLive=Object.values(results).some(r=>r.live);

  const handleSubmit=async entry=>{
    const ok=await saveEntry(entry);
    if(!ok){alert("Failed to save — check Supabase config.");return;}
    setEntries(prev=>[...prev.filter(e=>e.name!==entry.name),entry]);
  };
  const handleDelete=async name=>{
    await deleteEntry(name);
    setEntries(prev=>prev.filter(e=>e.name!==name));
  };

  const tabs=[
    {key:"bracket",label:"Submit Picks"},
    {key:"standings",label:"Standings"},
    {key:"rules",label:"Rules"},
    ...(isAdmin?[{key:"manage",label:"Admin"}]:[]),
  ];

  return(
    <div className="program-bg" style={{minHeight:"100vh",color:C.text,fontFamily:FONTS.body}}>
      <GlobalStyles/>

      {/* ── HEADER ── */}
      <header style={{background:"#fff",borderBottom:`3px solid ${C.navy}`,position:"relative"}}>
        <div style={{height:5,background:C.red}}/>
        <div style={{maxWidth:1340,margin:"0 auto",padding:"16px 24px 0"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,paddingBottom:14}}>
            <div onClick={()=>setView("bracket")} style={{display:"flex",alignItems:"center",gap:16,cursor:"pointer"}}>
              <div style={{
                width:56,height:56,background:C.red,flexShrink:0,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:30,boxShadow:"2px 2px 0 rgba(0,0,0,0.2)",
              }}>🏒</div>
              <div>
                <div style={{fontFamily:FONTS.display,fontSize:38,lineHeight:1,color:C.navy,letterSpacing:"2px"}}>
                  COLLEGE HOCKEY POOL
                </div>
                <div style={{fontFamily:FONTS.body,fontSize:11,fontWeight:700,color:C.red,letterSpacing:"5px",textTransform:"uppercase",marginTop:3}}>
                  NCAA D1 Men's Ice Hockey Championship · {YEAR}
                </div>
              </div>
            </div>

            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              {anyLive&&<span className="live-badge">● LIVE</span>}
              <div style={{display:"flex",border:`2px solid ${C.navy}`,borderRadius:1,overflow:"hidden"}}>
                {[
                  {label:"GAMES",val:`${completed}/15`},
                  {label:"ENTRIES",val:String(entries.length)},
                  {label:"MAX",val:`${MAX_PTS}pts`},
                ].map((s,i)=>(
                  <div key={s.label} style={{
                    padding:"6px 14px",textAlign:"center",background:C.bgCard,
                    borderRight:i<2?`1px solid ${C.navyBorder}`:"none",
                  }}>
                    <div style={{fontFamily:FONTS.mono,fontSize:15,color:C.navy,lineHeight:1,fontWeight:700}}>{s.val}</div>
                    <div style={{fontFamily:FONTS.body,fontSize:9,color:C.textLight,letterSpacing:"2px",marginTop:2,fontWeight:700}}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{display:"flex",gap:0,borderTop:`1px solid ${C.border}`}}>
            {tabs.map(t=>(
              <button key={t.key} onClick={()=>setView(t.key)} style={{
                background:"transparent",
                color:view===t.key?C.red:C.textMid,
                border:"none",
                borderBottom:view===t.key?`3px solid ${C.red}`:"3px solid transparent",
                padding:"11px 20px",fontSize:13,fontFamily:FONTS.display,
                cursor:"pointer",letterSpacing:"2px",textTransform:"uppercase",
                transition:"color 0.12s, border-color 0.12s",
              }}>{t.label}</button>
            ))}
          </div>
        </div>
      </header>

      {/* ── CONTENT ── */}
      <main style={{maxWidth:1340,margin:"0 auto",padding:"28px 24px 80px"}}>
        {loading&&(
          <div style={{textAlign:"center",padding:80}}>
            <div style={{fontFamily:FONTS.display,fontSize:48,letterSpacing:"6px",color:C.navy}}>LOADING…</div>
          </div>
        )}
        {!loading&&view==="bracket"&&<PickForm onSubmit={handleSubmit} entries={entries} started={started} results={results}/>}
        {!loading&&view==="standings"&&<Standings entries={entries} results={results}/>}
        {!loading&&view==="rules"&&<Rules/>}
        {!loading&&view==="manage"&&isAdmin&&<Manage entries={entries} onDelete={handleDelete} onRefresh={refresh}/>}
      </main>

      {lastFetch&&(
        <div style={{textAlign:"center",padding:"10px 16px",fontSize:10,color:C.textLight,fontFamily:FONTS.mono,letterSpacing:"2px",borderTop:`1px solid ${C.border}`}}>
          UPDATED {lastFetch.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PICK FORM
   ═══════════════════════════════════════════════════ */
function PickForm({onSubmit,entries,started,results}){
  const[name,setName]=useState("");
  const[email,setEmail]=useState("");
  const[tiebreak,setTiebreak]=useState("");
  const[picks,setPicks]=useState({});
  const[submitted,setSubmitted]=useState(false);
  const[newPin,setNewPin]=useState(null);
  const[saving,setSaving]=useState(false);
  const[chosenPin,setChosenPin]=useState("");

  // Edit / PIN flow
  const[editMode,setEditMode]=useState(false);  // PIN entry screen visible
  const[editTarget,setEditTarget]=useState("");  // name selected to edit
  const[pinInput,setPinInput]=useState("");
  const[pinError,setPinError]=useState(false);
  const[verifying,setVerifying]=useState(false);

  const doPick=(g,team)=>setPicks(cascade({...picks,[g]:team}));

  const handleSelectEdit=e=>{
    const n=e.target.value;
    setEditTarget(n);
    if(n){setEditMode(true);setPinInput("");setPinError(false);}
    else setEditMode(false);
  };

  const verifyPin=async()=>{
    if(pinInput.length!==4){setPinError(true);return;}
    setVerifying(true);
    const entry=await verifyEntryPin(editTarget,pinInput);
    setVerifying(false);
    if(!entry){setPinError(true);return;}
    setName(entry.name);
    setEmail(entry.email||"");
    setTiebreak(entry.tiebreak?String(entry.tiebreak):"");
    setPicks(entry.picks);
    setEditMode(false);
    setPinError(false);
  };

  const submit=async()=>{
    if(!name.trim())return alert("Please enter a bracket name.");
    if(!email.trim())return alert("Please enter your email.");
    if(!isComplete(picks))return alert("Please fill out all 15 picks.");
    if(!tiebreak)return alert("Please enter a tiebreaker (total goals in both semifinals + championship).");
    if(!editTarget&&chosenPin.length!==4)return alert("Please choose a 4-digit PIN.");
    const pin=editTarget?pinInput:chosenPin;
    setSaving(true);
    await onSubmit({name:name.trim(),email:email.trim(),tiebreak:Number(tiebreak),picks,submittedAt:new Date().toISOString(),pin});
    setSaving(false);
    setSubmitted(true);
  };

  const reset=()=>{
    setName("");setEmail("");setTiebreak("");setPicks({});
    setSubmitted(false);setNewPin(null);setEditMode(false);
    setPinInput("");setPinError(false);setEditTarget("");setChosenPin("");
  };

  /* ── Success screen ── */
  if(submitted) return(
    <Card style={{textAlign:"center",padding:"60px 24px",borderTop:`4px solid ${editTarget?C.navy:C.red}`}}>
      <div style={{fontSize:56,marginBottom:16}}>🎉</div>
      <div style={{fontFamily:FONTS.display,fontSize:52,color:C.navy,letterSpacing:"4px",marginBottom:8}}>
        {editTarget?"PICKS UPDATED":"BRACKET LOCKED IN"}
      </div>
      <p style={{color:C.textMid,fontSize:16,marginBottom:4}}>
        <strong style={{color:C.text}}>{name}</strong>'s picks are saved.
      </p>
      <p style={{color:C.textMid,fontSize:15,marginBottom:4}}>
        Champion: <strong style={{color:C.red}}>{picks[15]}</strong>
      </p>
      <p style={{color:C.textMid,fontSize:15,marginBottom:36}}>
        Tiebreaker: <strong style={{color:C.navy,fontFamily:FONTS.mono}}>{tiebreak} total goals</strong>
      </p>
      {!editTarget&&(
        <div style={{
          display:"inline-block",margin:"0 auto 36px",
          padding:"28px 48px",background:C.goldBg,
          border:`3px solid ${C.gold}`,borderRadius:1,
          boxShadow:"4px 4px 0 rgba(184,108,16,0.18)",
        }}>
          <div style={{fontFamily:FONTS.display,fontSize:28,color:C.gold,letterSpacing:"3px",marginBottom:10}}>
            COMPLETE YOUR ENTRY
          </div>
          <div style={{fontFamily:FONTS.body,fontSize:16,color:C.text,marginBottom:8,lineHeight:1.5}}>
            Send <strong style={{fontSize:20}}>$10</strong> via Venmo to
          </div>
          <div style={{fontFamily:FONTS.mono,fontSize:28,color:C.navy,fontWeight:700,letterSpacing:2,marginBottom:8}}>
            @drew-pynchon
          </div>
          <div style={{fontFamily:FONTS.body,fontSize:12,color:C.textLight,letterSpacing:1}}>
            YOUR ENTRY IS NOT OFFICIAL UNTIL PAYMENT IS RECEIVED
          </div>
        </div>
      )}
      <div style={{marginTop:editTarget?0:8}}>
        <p style={{fontSize:12,color:C.textMid,marginBottom:12,fontFamily:FONTS.mono,letterSpacing:1}}>
          Remember your 4-digit PIN to edit your picks later
        </p>
        <button onClick={reset} style={primaryBtn}>SUBMIT ANOTHER BRACKET</button>
      </div>
    </Card>
  );

  /* ── PIN entry screen ── */
  if(editMode) return(
    <div style={{animation:"fadeIn 0.2s ease"}}>
      <Card style={{maxWidth:400,margin:"40px auto",padding:"40px 32px",textAlign:"center",borderTop:`4px solid ${C.navy}`}}>
        <div style={{fontSize:40,marginBottom:16}}>🔐</div>
        <div style={{fontFamily:FONTS.display,fontSize:30,color:C.navy,letterSpacing:"3px",marginBottom:6}}>ENTER YOUR PIN</div>
        <p style={{color:C.textMid,fontSize:14,marginBottom:24,lineHeight:1.5}}>
          Enter the 4-digit PIN you received when you submitted{" "}
          <strong style={{color:C.text}}>{editTarget}</strong>'s bracket.
        </p>
        <input
          className="pin-input"
          value={pinInput}
          onChange={e=>{setPinInput(e.target.value.replace(/\D/g,"").slice(0,4));setPinError(false);}}
          placeholder="····"
          maxLength={4}
          autoFocus
          onKeyDown={e=>e.key==="Enter"&&pinInput.length===4&&verifyPin()}
        />
        {pinError&&(
          <p style={{color:C.red,fontSize:13,fontWeight:700,letterSpacing:1,marginTop:8,marginBottom:0}}>
            Incorrect PIN — try again.
          </p>
        )}
        <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:20}}>
          <button onClick={verifyPin} disabled={pinInput.length!==4||verifying} style={{
            ...navyBtn,
            opacity:pinInput.length!==4||verifying?0.4:1,
            cursor:pinInput.length!==4||verifying?"not-allowed":"pointer",
          }}>
            {verifying?"CHECKING…":"UNLOCK PICKS"}
          </button>
          <button onClick={()=>{setEditMode(false);setEditTarget("");setPinInput("");}} style={secondaryBtn}>CANCEL</button>
        </div>
        <p style={{marginTop:20,fontSize:11,color:C.textLight,fontFamily:FONTS.mono,letterSpacing:1}}>
          Lost your PIN? Ask the pool admin to reset it.
        </p>
      </Card>
    </div>
  );

  const cnt=Object.values(picks).filter(Boolean).length;
  const complete=isComplete(picks);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* ── Entry info form ── */}
      <Card style={{padding:"16px 20px"}}>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
          <Fld label="Bracket Name *" flex="1 1 160px">
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Drew's Domination"/>
          </Fld>
          <Fld label="Email *" flex="1 1 180px">
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com"/>
          </Fld>
          <Fld label="Tiebreaker — total goals in both semis + final *" flex="0 0 300px">
            <input value={tiebreak} onChange={e=>setTiebreak(e.target.value.replace(/\D/g,""))} placeholder="e.g. 18"/>
          </Fld>
          {!editTarget&&(
            <Fld label="Choose a 4-digit PIN *" flex="0 0 160px">
              <input value={chosenPin} onChange={e=>setChosenPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="e.g. 1234" maxLength={4} style={{fontFamily:FONTS.mono,letterSpacing:4,textAlign:"center"}}/>
            </Fld>
          )}
          {entries.length>0&&!editTarget&&(
            <Fld label="Edit existing entry" flex="0 0 180px">
              <select onChange={handleSelectEdit} value="">
                <option value="">Select name…</option>
                {[...entries].sort((a,b)=>a.name.localeCompare(b.name)).map(e=>(
                  <option key={e.name} value={e.name}>{e.name}</option>
                ))}
              </select>
            </Fld>
          )}
          {editTarget&&(
            <div style={{
              padding:"8px 14px",background:C.navyBg,
              border:`1px solid ${C.navyBorder}`,borderRadius:1,
              fontSize:12,fontFamily:FONTS.body,color:C.navy,
              letterSpacing:1,fontWeight:700,alignSelf:"flex-end",marginBottom:1,
            }}>
              ✏️ EDITING {editTarget.toUpperCase()}
            </div>
          )}
        </div>
      </Card>

      {/* ── Progress bar ── */}
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{flex:1,height:6,background:C.bgInset,borderRadius:1,overflow:"hidden",border:`1px solid ${C.border}`}}>
          <div style={{
            width:`${(cnt/15)*100}%`,height:"100%",
            background:complete?C.green:C.red,
            borderRadius:1,transition:"width 0.3s",
          }}/>
        </div>
        <span style={{fontFamily:FONTS.mono,fontSize:13,color:complete?C.green:C.red,minWidth:40,fontWeight:700}}>{cnt}/15</span>
        {complete&&<span style={{fontFamily:FONTS.display,fontSize:13,color:C.green,letterSpacing:2}}>COMPLETE ✓</span>}
      </div>

      <BracketVis picks={picks} onPick={doPick} results={results} interactive/>

      <div style={{textAlign:"center",marginTop:8}}>
        {started&&!editTarget&&(
          <div style={{
            marginBottom:12,padding:"10px 20px",display:"inline-block",
            background:C.redBg,border:`1px solid ${C.redBorder}`,borderRadius:1,
            fontSize:12,color:C.red,fontWeight:700,letterSpacing:1.5,
          }}>
            ⚠ TOURNAMENT HAS STARTED — NO NEW ENTRIES ACCEPTED
          </div>
        )}
        <button onClick={submit}
          disabled={!complete||!name.trim()||!email.trim()||!tiebreak||saving||(started&&!editTarget)||(!editTarget&&chosenPin.length!==4)}
          style={{
            ...primaryBtn,
            opacity:(!complete||!name.trim()||!email.trim()||!tiebreak||saving||(started&&!editTarget)||(!editTarget&&chosenPin.length!==4))?0.35:1,
            cursor:(!complete||!name.trim()||!email.trim()||!tiebreak||saving||(started&&!editTarget)||(!editTarget&&chosenPin.length!==4))?"not-allowed":"pointer",
            fontSize:18,padding:"16px 72px",letterSpacing:"4px",
          }}>
          {saving?"SAVING…":editTarget?"UPDATE PICKS ›":"LOCK IN BRACKET ›"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   BRACKET VISUALIZATION
   ═══════════════════════════════════════════════════ */
function BracketVis({picks,onPick,results,interactive}){
  const Team=({team,seed,gameNum,scoreVal})=>{
    if(!team) return(
      <div style={{
        padding:"6px 10px",fontSize:12,color:C.textLight,fontStyle:"italic",
        background:C.bgInset,borderRadius:1,marginBottom:2,minWidth:140,
        border:`1px dashed ${C.border}`,textAlign:"center",fontFamily:FONTS.body,
      }}>TBD</div>
    );
    const picked=picks[gameNum]===team;
    const rw=results[gameNum]?.winner;
    const correct=rw&&eq(team,rw);
    const wrong=rw&&picked&&!correct;
    const lost=rw&&!eq(team,rw);

    let bg=C.bgCard,border=C.border,color=C.text,weight=400;
    if(picked&&!rw)  {bg=C.navyBg; border=C.navyBorder; color=C.navy;  weight=700;}
    if(correct&&picked){bg=C.greenBg;border=C.greenBorder;color=C.green; weight=700;}
    if(correct&&!picked){color=C.green;weight=600;}
    if(wrong)        {bg=C.redBg;  border=C.redBorder;  color=C.red;   weight=600;}

    return(
      <div className={interactive?"team-btn":""} onClick={()=>interactive&&onPick&&onPick(gameNum,team)} style={{
        padding:"6px 8px",fontSize:12,fontWeight:weight,color,background:bg,
        border:`1.5px solid ${border}`,borderRadius:1,marginBottom:2,
        cursor:interactive?"pointer":"default",
        display:"flex",justifyContent:"space-between",alignItems:"center",
        minWidth:140,fontFamily:FONTS.body,
      }}>
        <span style={{display:"flex",alignItems:"center",gap:6}}>
          <TeamLogo team={team} size={18} style={{filter:lost&&!picked?"grayscale(1) opacity(0.35)":"none"}}/>
          {seed!=null&&<span style={{color:C.gold,fontSize:9,fontWeight:800,fontFamily:FONTS.mono,minWidth:16}}>{seed}</span>}
          <span style={{textDecoration:lost&&!picked?"line-through":"none",opacity:lost&&!picked?0.4:1}}>{team}</span>
        </span>
        <span style={{display:"flex",alignItems:"center",gap:4}}>
          {scoreVal!=null&&(
            <span style={{fontFamily:FONTS.mono,fontSize:11,padding:"1px 5px",borderRadius:1,background:C.navy,color:"#faf7f1"}}>{scoreVal}</span>
          )}
          {correct&&picked&&<span style={{color:C.green,fontSize:12}}>✓</span>}
          {wrong&&<span style={{color:C.red,fontSize:12}}>✗</span>}
        </span>
      </div>
    );
  };

  const Game=({g})=>{
    const cfg=BRACKET[g]; const r=results[g];
    let top,bottom,seedT,seedB;
    if(g<=8){
      top=cfg.top; bottom=cfg.bottom;
      seedT=cfg.seedTop; seedB=cfg.seedBottom;
    } else {
      const[f1,f2]=cfg.from;
      top=picks[f1]||null; bottom=picks[f2]||null;
    }
    return(
      <div style={{marginBottom:g<=8?4:8}}>
        <div style={{
          fontSize:9,fontWeight:700,letterSpacing:"1.5px",marginBottom:3,
          display:"flex",justifyContent:"space-between",alignItems:"center",
          fontFamily:FONTS.mono,textTransform:"uppercase",color:C.textLight,
        }}>
          <span>{POINTS[g]}PT</span>
          {r?.live&&<span style={{color:C.red,animation:"pulse 1.5s infinite"}}>● {r.period||"LIVE"}</span>}
          {r?.final&&<span style={{color:C.green}}>{r.period?.includes("OT")?r.period:"FINAL"}</span>}
        </div>
        <Team team={top} seed={seedT} gameNum={g} scoreVal={r?.scores?.[0]}/>
        <Team team={bottom} seed={seedB} gameNum={g} scoreVal={r?.scores?.[1]}/>
      </div>
    );
  };

  return(
    <Card style={{overflow:"auto",padding:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gridTemplateRows:"1fr 1fr",gap:"0 10px",minWidth:1000}}>
        {/* Row 1: G1/G2, G9, then row 2: G3/G4, G10 — left side first round + QF */}
        <div style={{gridRow:"1",gridColumn:"1",display:"flex",flexDirection:"column",justifyContent:"center",minHeight:320}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}><Game g={1}/></div>
          <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}><Game g={2}/></div>
        </div>
        <VCol jc="center" h={320} style={{gridRow:"1",gridColumn:"2"}}><Game g={9}/></VCol>

        <div style={{gridRow:"2",gridColumn:"1",display:"flex",flexDirection:"column",justifyContent:"center",minHeight:320}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}><Game g={3}/></div>
          <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}><Game g={4}/></div>
        </div>
        <VCol jc="center" h={320} style={{gridRow:"2",gridColumn:"2"}}><Game g={10}/></VCol>

        {/* Center 3 columns span both rows */}
        <div style={{gridRow:"1 / 3",gridColumn:"3",display:"flex",flexDirection:"column",justifyContent:"center"}}><Game g={13}/></div>
        <div style={{gridRow:"1 / 3",gridColumn:"4",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center"}}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontFamily:FONTS.display,fontSize:10,color:C.textMid,letterSpacing:"5px",marginBottom:8}}>🏆 CHAMPION</div>
            <div style={{
              fontFamily:FONTS.display,fontSize:20,letterSpacing:2,
              color:picks[15]?C.navy:C.textLight,
              padding:"12px 16px",minWidth:140,borderRadius:1,
              border:`2px solid ${picks[15]?C.navy:C.border}`,
              background:picks[15]?C.navyBg:C.bgInset,
              boxShadow:picks[15]?"2px 2px 0 rgba(26,42,74,0.15)":"none",
              display:"flex",alignItems:"center",justifyContent:"center",gap:10,
            }}>
              {picks[15]&&<TeamLogo team={picks[15]} size={28}/>}
              {picks[15]||"?"}
            </div>
            {picks[15]&&<div style={{fontFamily:FONTS.mono,fontSize:10,color:C.navy,marginTop:6,letterSpacing:2,fontWeight:700}}>8 POINTS</div>}
          </div>
          <Game g={15}/>
        </div>
        <div style={{gridRow:"1 / 3",gridColumn:"5",display:"flex",flexDirection:"column",justifyContent:"center"}}><Game g={14}/></div>

        {/* Row 1: G11, G5/G6, then row 2: G12, G7/G8 — right side QF + first round */}
        <VCol jc="center" h={320} style={{gridRow:"1",gridColumn:"6"}}><Game g={11}/></VCol>
        <div style={{gridRow:"1",gridColumn:"7",display:"flex",flexDirection:"column",justifyContent:"center",minHeight:320}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}><Game g={5}/></div>
          <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}><Game g={6}/></div>
        </div>

        <VCol jc="center" h={320} style={{gridRow:"2",gridColumn:"6"}}><Game g={12}/></VCol>
        <div style={{gridRow:"2",gridColumn:"7",display:"flex",flexDirection:"column",justifyContent:"center",minHeight:320}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}><Game g={7}/></div>
          <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}><Game g={8}/></div>
        </div>
      </div>
    </Card>
  );
}

function VCol({children,jc,ai,h,style={}}){
  return <div style={{display:"flex",flexDirection:"column",justifyContent:jc||"center",alignItems:ai||"stretch",minHeight:h,...style}}>{children}</div>;
}

/* ═══════════════════════════════════════════════════
   STANDINGS
   ═══════════════════════════════════════════════════ */
function Standings({entries,results}){
  const eliminated=getEliminated(results);
  const hasResults=Object.values(results).some(r=>r.final);
  const[expanded,setExpanded]=useState(null);
  const[viewBracket,setViewBracket]=useState(null);

  const scored=entries.map(e=>{
    const s=scoreEntry(e,results);
    let alive=0;
    for(let g=1;g<=15;g++){if(!results[g]?.winner&&!eliminated.has(norm(e.picks[g])))alive+=POINTS[g];}
    return{...e,...s,alive};
  }).sort((a,b)=>b.total-a.total||b.maxPossible-a.maxPossible||a.name.localeCompare(b.name));

  let rank=1;
  scored.forEach((p,i)=>{if(i>0&&p.total<scored[i-1].total)rank=i+1;p.rank=rank;});

  if(viewBracket){
    const e=entries.find(x=>x.name===viewBracket);
    if(!e)return null;
    return(
      <div>
        <button onClick={()=>setViewBracket(null)} style={{...secondaryBtn,marginBottom:16}}>← BACK TO STANDINGS</button>
        <Card style={{marginBottom:14,padding:"16px 20px",borderTop:`4px solid ${C.navy}`}}>
          <div style={{fontFamily:FONTS.display,fontSize:32,color:C.navy,letterSpacing:2,marginBottom:4}}>{e.name}</div>
          <div style={{fontSize:13,color:C.textMid,display:"flex",alignItems:"center",gap:8}}>
            <TeamLogo team={e.picks[15]} size={20}/>
            Champion: <strong style={{color:C.red}}>{e.picks[15]}</strong>
            <span style={{color:C.border}}>·</span>
            Tiebreaker: <strong style={{color:C.navy,fontFamily:FONTS.mono}}>{e.tiebreak} goals</strong>
          </div>
        </Card>
        <BracketVis picks={e.picks} onPick={null} results={results}/>
      </div>
    );
  }

  if(!entries.length) return(
    <Card style={{textAlign:"center",padding:60}}>
      <div style={{fontFamily:FONTS.display,fontSize:36,color:C.navy,letterSpacing:"4px"}}>NO ENTRIES YET</div>
      <div style={{color:C.textLight,marginTop:8}}>Submit picks in the bracket tab!</div>
    </Card>
  );

  const semi1=results[13],semi2=results[14],champResult=results[15];
  const allTBGamesFinal=semi1?.final&&semi2?.final&&champResult?.final;
  const tbGoals=allTBGamesFinal?
    (semi1.scores[0]||0)+(semi1.scores[1]||0)+
    (semi2.scores[0]||0)+(semi2.scores[1]||0)+
    (champResult.scores[0]||0)+(champResult.scores[1]||0):null;
  const rankColors={1:C.gold,2:"#808080",3:"#8a5a2a"};

  if(!hasResults) return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <Card style={{textAlign:"center",padding:"32px 20px"}}>
        <div style={{fontFamily:FONTS.display,fontSize:28,color:C.navy,letterSpacing:"4px",marginBottom:8}}>TOURNAMENT HASN'T STARTED</div>
        <div style={{color:C.textLight,fontSize:14}}>Standings will update live once games begin.</div>
      </Card>
      <ScoringKey/>
      <SectionHeader>ALL ENTRIES ({entries.length})</SectionHeader>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
        {[...entries].sort((a,b)=>a.name.localeCompare(b.name)).map(e=>(
          <Card key={e.name} style={{padding:"16px 18px",cursor:"pointer"}} onClick={()=>setViewBracket(e.name)}>
            <div style={{fontFamily:FONTS.display,fontSize:20,color:C.navy,letterSpacing:1,marginBottom:8,textDecoration:"underline",textUnderlineOffset:2}}>{e.name}</div>
            <div style={{fontSize:13,color:C.textMid,display:"flex",alignItems:"center",gap:6}}>
              <TeamLogo team={e.picks[15]} size={16}/>
              <span>🏆 <strong style={{color:C.red}}>{e.picks[15]}</strong></span>
            </div>
            <div style={{fontFamily:FONTS.mono,fontSize:11,color:C.textLight,marginTop:4}}>TB: {e.tiebreak} GOALS</div>
          </Card>
        ))}
      </div>
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <ScoringKey/>
      <Card style={{padding:0,overflow:"hidden"}}>
        {tbGoals!==null&&(
          <div style={{padding:"12px 20px",background:C.goldBg,borderBottom:`1px solid rgba(184,108,16,0.25)`,fontFamily:FONTS.mono,fontSize:13,color:C.gold,letterSpacing:1,fontWeight:700}}>
            🏆 SEMIS + CHAMPIONSHIP TOTAL GOALS: {tbGoals} — TIEBREAKER TARGET
          </div>
        )}
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{borderBottom:`2px solid ${C.navy}`,background:C.bgInset}}>
                {["#","Name","Pts","Max","Alive","Champion","TB"].map(h=>(
                  <th key={h} style={{textAlign:h==="Name"?"left":"center",padding:"11px 14px",color:C.navy,fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",whiteSpace:"nowrap",fontFamily:FONTS.body}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scored.map((p,i)=>{
                const cElim=eliminated.has(norm(p.picks[15]));
                const cWon=results[15]?.winner&&eq(p.picks[15],results[15].winner);
                const tbDiff=tbGoals!==null&&p.tiebreak?Math.abs(p.tiebreak-tbGoals):null;
                const isExp=expanded===p.name;
                const rows=[(
                  <tr key={p.name} onClick={()=>setExpanded(isExp?null:p.name)} style={{
                    borderBottom:`1px solid ${C.border}`,
                    background:isExp?C.navyBg:i%2===0?C.bgCard:C.bgCardAlt,
                    transition:"background 0.1s",
                  }}>
                    <td style={{textAlign:"center",padding:"12px 14px"}}>
                      <span style={{fontFamily:FONTS.display,fontSize:24,color:rankColors[p.rank]||C.textMid,letterSpacing:1}}>{p.rank}</span>
                    </td>
                    <td style={{padding:"12px 14px",fontWeight:700,fontFamily:FONTS.body,fontSize:14}}>
                      <span onClick={e=>{e.stopPropagation();setViewBracket(p.name);}} style={{color:C.navy,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:2}}>{p.name}</span>
                    </td>
                    <td style={{textAlign:"center",padding:"12px 14px"}}>
                      <span style={{fontFamily:FONTS.display,fontSize:28,color:C.red,letterSpacing:1}}>{p.total}</span>
                    </td>
                    <td style={{textAlign:"center",padding:"12px 14px",fontFamily:FONTS.mono,fontSize:12,color:C.textLight}}>{p.maxPossible}</td>
                    <td style={{textAlign:"center",padding:"12px 14px",fontFamily:FONTS.mono,fontSize:12,color:p.alive>0?C.green:C.textLight}}>{p.alive}</td>
                    <td style={{textAlign:"center",padding:"12px 14px"}}>
                      <span style={{display:"inline-flex",alignItems:"center",gap:6,fontWeight:700,color:cWon?C.green:cElim?C.red:C.text,textDecoration:cElim?"line-through":"none"}}>
                        <TeamLogo team={p.picks[15]} size={16} style={{filter:cElim?"grayscale(1) opacity(0.4)":"none"}}/>
                        {p.picks[15]}
                      </span>
                    </td>
                    <td style={{textAlign:"center",padding:"12px 14px",fontFamily:FONTS.mono,fontSize:12,color:C.textMid}}>
                      {p.tiebreak||"—"}{tbDiff!==null&&<span style={{fontSize:10,color:C.textLight,marginLeft:3}}>(±{tbDiff})</span>}
                    </td>
                  </tr>
                )];
                if(isExp) rows.push(
                  <tr key={p.name+"_d"}>
                    <td colSpan={7} style={{padding:"8px 14px 16px",background:C.navyBg,borderBottom:`1px solid ${C.border}`}}>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:4}}>
                        {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map(g=>{
                          const d=p.details[g];const pElim=eliminated.has(norm(d.pick));
                          return(
                            <div key={g} style={{
                              padding:"5px 8px",fontSize:11,borderRadius:1,
                              background:d.correct===true?C.greenBg:d.correct===false?C.redBg:C.bgCard,
                              border:`1px solid ${d.correct===true?C.greenBorder:d.correct===false?C.redBorder:C.border}`,
                              display:"flex",alignItems:"center",gap:5,
                            }}>
                              <span style={{fontFamily:FONTS.mono,color:C.textLight,fontSize:9,minWidth:28}}>G{g}·{POINTS[g]}p</span>
                              <TeamLogo team={d.pick} size={14} style={{filter:pElim&&d.correct===null?"grayscale(1) opacity(0.4)":"none"}}/>
                              <span style={{fontWeight:700,color:d.correct===true?C.green:d.correct===false?C.red:pElim&&d.correct===null?C.textLight:C.text,textDecoration:pElim&&d.correct===null?"line-through":"none"}}>
                                {d.pick}{d.correct===true?" ✓":d.correct===false?" ✗":""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
                return rows;
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   RULES
   ═══════════════════════════════════════════════════ */
function Rules(){
  const rules=[
    {title:"ENTRY FEE",text:"$10 per bracket. Venmo @drew-pynchon to complete your entry. Your entry is not official until payment is received."},
    {title:"HOW TO PLAY",text:"Pick the winner of all 15 tournament games. Fill out the bracket by clicking on the team you think will win each matchup. Your later-round picks cascade automatically."},
    {title:"SCORING",items:[
      "First Round (8 games): 1 point each",
      "Quarterfinals (4 games): 2 points each",
      "Semifinals (2 games): 4 points each",
      "Championship (1 game): 8 points",
      `Maximum possible: ${MAX_PTS} points`,
    ]},
    {title:"TIEBREAKER",text:"Predict the total combined goals scored across both semifinal games and the championship game (3 games total). Closest to the actual total wins the tiebreaker."},
    {title:"EDITING YOUR PICKS",text:"When you submit your bracket, you choose a 4-digit PIN. Use this PIN to edit your picks anytime before the tournament starts."},
    {title:"PRIZES",text:"Winner takes all! In the event of a tie, the tiebreaker determines the winner. If still tied, the pot is split."},
  ];
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:700,margin:"0 auto"}}>
      <Card style={{textAlign:"center",padding:"32px 20px",borderTop:`4px solid ${C.red}`}}>
        <div style={{fontFamily:FONTS.display,fontSize:36,color:C.navy,letterSpacing:"4px",marginBottom:8}}>POOL RULES</div>
        <div style={{color:C.textMid,fontSize:14}}>NCAA D1 Men's Ice Hockey Championship · {YEAR}</div>
      </Card>
      {rules.map(r=>(
        <Card key={r.title} style={{padding:"20px 24px"}}>
          <div style={{fontFamily:FONTS.display,fontSize:18,color:C.navy,letterSpacing:2,marginBottom:10}}>{r.title}</div>
          {r.text&&<div style={{fontSize:14,color:C.textMid,lineHeight:1.6}}>{r.text}</div>}
          {r.items&&(
            <ul style={{margin:0,paddingLeft:20,fontSize:14,color:C.textMid,lineHeight:1.8}}>
              {r.items.map((item,i)=><li key={i}>{item}</li>)}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ENTRIES LIST (kept for bracket detail view reuse)
   ═══════════════════════════════════════════════════ */
function EntriesList({entries,results}){
  const[viewName,setViewName]=useState(null);

  if(!entries.length) return(
    <Card style={{textAlign:"center",padding:60}}>
      <div style={{fontFamily:FONTS.display,fontSize:32,color:C.navy,letterSpacing:"4px"}}>NO ENTRIES YET</div>
    </Card>
  );

  if(viewName){
    const e=entries.find(x=>x.name===viewName);
    if(!e)return null;
    return(
      <div>
        <button onClick={()=>setViewName(null)} style={{...secondaryBtn,marginBottom:16}}>← ALL ENTRIES</button>
        <Card style={{marginBottom:14,padding:"16px 20px",borderTop:`4px solid ${C.navy}`}}>
          <div style={{fontFamily:FONTS.display,fontSize:32,color:C.navy,letterSpacing:2,marginBottom:4}}>{e.name}</div>
          {e.email&&<div style={{fontSize:12,color:C.textLight,marginBottom:4}}>{e.email}</div>}
          <div style={{fontSize:13,color:C.textMid,display:"flex",alignItems:"center",gap:8}}>
            <TeamLogo team={e.picks[15]} size={20}/>
            Champion: <strong style={{color:C.red}}>{e.picks[15]}</strong>
            <span style={{color:C.border}}>·</span>
            Tiebreaker: <strong style={{color:C.navy,fontFamily:FONTS.mono}}>{e.tiebreak} goals</strong>
          </div>
        </Card>
        <BracketVis picks={e.picks} onPick={null} results={results}/>
      </div>
    );
  }

  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
      {[...entries].sort((a,b)=>a.name.localeCompare(b.name)).map(e=>(
        <Card key={e.name} style={{padding:"18px 20px",cursor:"pointer",transition:"box-shadow 0.15s,border-top-color 0.15s"}}
          onClick={()=>setViewName(e.name)}
          onMouseEnter={ev=>{ev.currentTarget.style.borderTopColor=C.navy;ev.currentTarget.style.boxShadow="3px 3px 0 rgba(26,42,74,0.12)";}}
          onMouseLeave={ev=>{ev.currentTarget.style.borderTopColor=C.red;ev.currentTarget.style.boxShadow=C.shadow;}}>
          <div style={{fontFamily:FONTS.display,fontSize:22,color:C.navy,letterSpacing:1,marginBottom:10}}>{e.name}</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,color:C.textMid,display:"flex",alignItems:"center",gap:6}}>
              <TeamLogo team={e.picks[15]} size={18}/>
              <span style={{color:C.red,fontWeight:700}}>{e.picks[15]}</span>
            </span>
            <span style={{fontFamily:FONTS.mono,fontSize:11,color:C.textLight}}>TB:{e.tiebreak}</span>
          </div>
          <div style={{fontFamily:FONTS.mono,fontSize:10,color:C.textLight,marginTop:8}}>
            {new Date(e.submittedAt).toLocaleDateString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ADMIN
   ═══════════════════════════════════════════════════ */
function Manage({entries,onDelete,onRefresh}){
  const[confirm,setConfirm]=useState(null);
  const[adminEntries,setAdminEntries]=useState([]);
  const[loadingPins,setLoadingPins]=useState(true);
  const[resetResult,setResetResult]=useState(null);
  const[paidMap,setPaidMap]=useState({});

  useEffect(()=>{
    setLoadingPins(true);
    loadEntriesWithPins().then(data=>{
      setAdminEntries(data);
      setLoadingPins(false);
      const pm={};data.forEach(e=>{pm[e.name]=!!e.paid;});setPaidMap(pm);
    });
  },[entries]);

  const togglePaid=async(name)=>{
    const newVal=!paidMap[name];
    setPaidMap(prev=>({...prev,[name]:newVal}));
    await updatePaidStatus(name,newVal);
  };

  const doResetPin=async name=>{
    const pin=await resetEntryPin(name);
    if(pin){
      setResetResult({name,pin});
      setAdminEntries(prev=>prev.map(e=>e.name===name?{...e,pin}:e));
    }
  };

  // BUG FIX: game 15 is already in the loop — removed duplicate ,Champion column
  const exportCSV=()=>{
    let csv="Name,Email,Tiebreaker,Submitted";
    for(let g=1;g<=15;g++)csv+=`,Game ${g} (${ROUND_LABEL(g)} ${POINTS[g]}pt)`;
    csv+="\n";
    entries.forEach(e=>{
      csv+=`"${e.name}","${e.email||""}",${e.tiebreak||""},"${e.submittedAt}"`;
      for(let g=1;g<=15;g++)csv+=`,"${e.picks[g]||""}"`;
      csv+="\n";
    });
    dl(csv,"hockey_pool_2026_entries.csv","text/csv");
  };

  const exportJSON=()=>dl(JSON.stringify(entries,null,2),"hockey_pool_2026.json","application/json");
  const dl=(c,f,t)=>{const b=new Blob([c],{type:t});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=f;a.click();URL.revokeObjectURL(u);};
  const clearAll=async()=>{if(!window.confirm("Delete ALL entries? This cannot be undone."))return;for(const e of entries)await onDelete(e.name);};

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <Card>
        <SectionHeader>⚙️ ADMIN PANEL</SectionHeader>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {[{l:"↓ CSV",f:exportCSV},{l:"↓ JSON",f:exportJSON},{l:"↻ REFRESH",f:onRefresh}].map(b=>(
            <button key={b.l} onClick={b.f} style={secondaryBtn}>{b.l}</button>
          ))}
          <button onClick={clearAll} style={{...secondaryBtn,color:C.red,borderColor:C.redBorder}}>🗑 DELETE ALL</button>
        </div>
      </Card>

      {resetResult&&(
        <Card style={{borderTop:`4px solid ${C.gold}`,padding:"16px 20px"}}>
          <div style={{fontFamily:FONTS.display,fontSize:16,color:C.gold,letterSpacing:2,marginBottom:8}}>PIN RESET</div>
          <p style={{color:C.textMid,fontSize:14,margin:0}}>
            <strong style={{color:C.text}}>{resetResult.name}</strong>'s new PIN:{" "}
            <strong style={{fontFamily:FONTS.mono,fontSize:22,color:C.red,letterSpacing:6}}>{resetResult.pin}</strong>
          </p>
          <button onClick={()=>setResetResult(null)} style={{...secondaryBtn,marginTop:10,fontSize:11}}>DISMISS</button>
        </Card>
      )}

      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{
          padding:"14px 20px",borderBottom:`2px solid ${C.navy}`,
          display:"flex",alignItems:"center",justifyContent:"space-between",
          background:C.bgInset,
        }}>
          <span style={{fontFamily:FONTS.display,fontSize:18,color:C.navy,letterSpacing:2}}>ENTRIES & PINS ({entries.length})</span>
          {loadingPins&&<span style={{fontSize:11,color:C.textLight,fontFamily:FONTS.mono}}>LOADING…</span>}
        </div>
        {!entries.length?(
          <div style={{padding:"24px 20px",color:C.textLight,fontSize:13}}>No entries yet.</div>
        ):(
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:C.bgInset,borderBottom:`1px solid ${C.border}`}}>
                  {["Name","Email","Champion","TB","PIN","Paid","Submitted","Actions"].map(h=>(
                    <th key={h} style={{
                      padding:"10px 14px",
                      textAlign:h==="Name"||h==="Actions"?"left":"center",
                      color:C.navy,fontSize:10,fontWeight:700,letterSpacing:"2px",
                      fontFamily:FONTS.body,textTransform:"uppercase",whiteSpace:"nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...entries].sort((a,b)=>a.name.localeCompare(b.name)).map((e,i)=>{
                  const ae=adminEntries.find(x=>x.name===e.name);
                  return(
                    <tr key={e.name} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.bgCard:C.bgCardAlt}}>
                      <td style={{padding:"10px 14px",fontWeight:700,color:C.text}}>{e.name}</td>
                      <td style={{padding:"10px 14px",color:C.textLight,fontSize:12}}>{e.email||"—"}</td>
                      <td style={{padding:"10px 14px",textAlign:"center"}}>
                        <span style={{display:"inline-flex",alignItems:"center",gap:5,color:C.red,fontWeight:700}}>
                          <TeamLogo team={e.picks[15]} size={14}/>{e.picks[15]}
                        </span>
                      </td>
                      <td style={{padding:"10px 14px",textAlign:"center",fontFamily:FONTS.mono,fontSize:12,color:C.textMid}}>{e.tiebreak}</td>
                      <td style={{padding:"10px 14px",textAlign:"center"}}>
                        <span style={{fontFamily:FONTS.mono,fontSize:16,color:ae?.pin?C.red:C.textLight,letterSpacing:4,fontWeight:700}}>
                          {loadingPins?"…":ae?.pin||"—"}
                        </span>
                      </td>
                      <td style={{padding:"10px 14px",textAlign:"center"}}>
                        <button onClick={()=>togglePaid(e.name)} style={{
                          background:paidMap[e.name]?C.greenBg:"transparent",
                          border:`1.5px solid ${paidMap[e.name]?C.greenBorder:C.border}`,
                          borderRadius:1,padding:"4px 12px",cursor:"pointer",
                          fontFamily:FONTS.mono,fontSize:12,fontWeight:700,
                          color:paidMap[e.name]?C.green:C.textLight,
                        }}>
                          {paidMap[e.name]?"PAID ✓":"UNPAID"}
                        </button>
                      </td>
                      <td style={{padding:"10px 14px",textAlign:"center",fontFamily:FONTS.mono,fontSize:11,color:C.textLight}}>
                        {e.submittedAt?new Date(e.submittedAt).toLocaleDateString():"—"}
                      </td>
                      <td style={{padding:"10px 14px"}}>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          <button onClick={()=>doResetPin(e.name)} style={{...secondaryBtn,fontSize:11,padding:"5px 10px",color:C.gold,borderColor:`rgba(184,108,16,0.4)`}}>
                            RESET PIN
                          </button>
                          {confirm===e.name?(
                            <>
                              <button onClick={()=>{onDelete(e.name);setConfirm(null);}} style={{...secondaryBtn,fontSize:11,padding:"5px 10px",color:C.red,borderColor:C.redBorder,fontWeight:700}}>CONFIRM</button>
                              <button onClick={()=>setConfirm(null)} style={{...secondaryBtn,fontSize:11,padding:"5px 10px"}}>CANCEL</button>
                            </>
                          ):(
                            <button onClick={()=>setConfirm(e.name)} style={{...secondaryBtn,fontSize:11,padding:"5px 10px",color:C.red,borderColor:C.redBorder}}>DELETE</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
