const areas = [
  ["Våld & övergrepp", 9], ["Psykisk hälsa", 8], ["Familj & anhöriga", 6],
  ["Barn & unga", 5], ["Beroende & missbruk", 5], ["Sorg & förlust", 4],
  ["Övriga områden", 16],
];

export default function Home() {
  return <main>
    <header><div><p className="eyebrow">STÖDLINJER · INTERN ANALYS</p><h1>Ett tydligt kartverk<br />över stödet.</h1><p className="lede">Översikt av katalogens bredd, kontaktvägar och områden där redaktionen kan fördjupa täckningen.</p></div><p className="updated">● Uppdaterad 5 augusti 2026</p></header>
    <section className="metrics"><Metric n="53" t="aktiva stödlinjer"/><Metric n="13" t="områden för stöd"/><Metric n="11" t="med dygnet runt-stöd"/><Metric n="100%" t="har verifierad information"/></section>
    <section className="grid"><article className="panel"><p className="eyebrow">KATALOGENS FÖRDELNING</p><h2>Stöd per område</h2><div className="bars">{areas.map(([name,n]) => <div className="bar" key={name as string}><span>{name as string}</span><i><b style={{width:`${(n as number)/16*100}%`}}/></i><strong>{n as number}</strong></div>)}</div></article><article className="panel dark"><p className="eyebrow">KONTAKTVÄGAR</p><h2>Telefon är basen.<br />Chatten breddar tillgängligheten.</h2><div className="circle"><b>43</b><span>telefon</span></div><p className="legend">● Telefon 43　 <em>●</em> Chatt 16</p></article></section>
    <section className="insights"><div><p className="eyebrow">REDAKTIONELLT FOKUS</p><h2>Tre saker att hålla nära</h2></div><Card no="01" title="Säkra vägen i akut läge" text="Lyft alltid 112 och dygnet-runt-stödet först i flöden där tid och tydlighet är avgörande."/><Card no="02" title="Gör chatt synlig" text="Chatt är ett viktigt komplement när telefon inte känns möjlig. Visa kontaktformen direkt i sökresultatet."/><Card no="03" title="Fördjupa smala områden" text="Områden med få alternativ behöver löpande omvärldsbevakning och extra omsorg vid kvalitetsgranskning."/></section>
    <footer><b>Underlag</b><span>Analysen bygger på den aktiva katalogen i Stödlinjer och är avsedd som redaktionell översikt — inte som ett mått på behov eller efterfrågan.</span><a href="https://www.stodlinjer.se/">Till stödkatalogen →</a></footer>
  </main>;
}
function Metric({n,t}:{n:string,t:string}) { return <article><b>{n}</b><span>{t}</span></article>; }
function Card({no,title,text}:{no:string,title:string,text:string}) { return <article><small>{no}</small><h3>{title}</h3><p>{text}</p></article>; }
