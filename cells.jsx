import { useState } from "react";

const LV = [30, 155, 235];
const LV_LABEL = ["беден", "богат", "полон"];
const LV_LABEL_SHORT = ["○", "◑", "●"];

function cellRgb(str, arm, reg) {
  return `rgb(${LV[str]}, ${LV[reg]}, ${LV[arm]})`;
}

function cellGlow(str, arm, reg) {
  return `0 0 18px 4px rgba(${LV[str]},${LV[reg]},${LV[arm]},0.45), 0 0 40px 8px rgba(${LV[str]},${LV[reg]},${LV[arm]},0.18)`;
}

const CELLS = [
  { str:0,arm:0,reg:0, name:"Личинка",
    desc:"Почти беспомощная форма жизни. Слабые, хаотичные укусы, никакой защиты, восстановление нулевое. Существует скорее вопреки, чем благодаря.",
    good:"Может брать числом. Не представляет интереса для охотников — нечего есть.",
    bad:"Гибнет от любого противника. Не способна защититься, убежать или восстановиться." },
  { str:0,arm:0,reg:1, name:"Слизень",
    desc:"Слабая и открытая, но умеет чуть-чуть затягивать царапины. Почти безвредна для окружающих.",
    good:"Переживёт стычку с другим слабым существом за счёт мизерного регена.",
    bad:"Против серьёзного противника гибнет быстрее, чем реген успевает сработать." },
  { str:0,arm:0,reg:2, name:"Пожиратель",
    desc:"Максимальный реген, но ни силы ни брони. Вынуждена непрерывно охотиться — иначе умрёт от голода. В бою восстанавливаться особенно тяжело.",
    good:"Затяжная война на истощение со слабыми. Ускользает и залечивается вдали от боя.",
    bad:"Любой противник с силой или бронёй добьёт прежде чем реген поможет. Голод — постоянный смертельный риск." },
  { str:0,arm:1,reg:0, name:"Чешуйка",
    desc:"Лёгкая броня, никакой угрозы, нет регена. Держится чуть дольше слабых — и только. Немного теряет в скорости.",
    good:"Пассивная защита от слабых атак. Неплохая приманка или живой щит в стае.",
    bad:"Не может причинить вред. Любая серьёзная атака пробьёт. Медленнее открытых клеток." },
  { str:0,arm:1,reg:1, name:"Стойкий",
    desc:"Небольшая броня и немного регена — живёт дольше среднего, совсем не опасен. Тихий выживальщик.",
    good:"Переживает мелкие стычки. Тихо восстанавливается на периферии боя.",
    bad:"Без атаки бесполезен в открытом бою. Медленный. Не может добыть пищу для регена." },
  { str:0,arm:1,reg:2, name:"Мицелий",
    desc:"Полный реген и средняя броня — без единого зуба. Практически вечный, но пассивный. Вечно голоден, а убивать нечем.",
    good:"Крайне сложно добить. Хороший «якорь» в стае — отвлекает и тянет время.",
    bad:"Голод убивает быстрее врагов. Без атаки не добудет пищу." },
  { str:0,arm:2,reg:0, name:"Танк",
    desc:"Максимальная броня, нет силы, нет регена. Крепость на ножках. Медленный, неуязвимый, безобидный.",
    good:"Принимает удары за союзников. Блокирует и сдерживает. Глубокие ранения почти не берут.",
    bad:"Не убивает. Самый медленный архетип. Без регена гибнет от накопленных микроповреждений." },
  { str:0,arm:2,reg:1, name:"Бастион",
    desc:"Полная броня и умеренный реген. Долго стоит, медленно лечится, не кусается. Оборонительный монолит.",
    good:"Держит позиции долго. Вытягивает бои на истощение. Сложно убить.",
    bad:"Не представляет угрозы. Крайне медленный. Голод присутствует, но умеренный." },
  { str:0,arm:2,reg:2, name:"Монолит",
    desc:"Полная броня и полный реген — почти неубиваемый, совершенно безобидный. Страдает от голода и неповоротливости одновременно.",
    good:"Фактически бессмертен в бою. Невозможно нанести глубокое ранение. Оттягивает целые стаи.",
    bad:"Убить кого-либо почти невозможно. Голод смертелен без поддержки союзников. Крайне медленный." },

  { str:1,arm:0,reg:0, name:"Кусака",
    desc:"Умеренная сила, никакой брони, нет регена. Быстрые укусы среднего урона — хорош для контроля, но хрупок.",
    good:"Беспокоящие атаки. Контроль слабых целей. Быстро наносит небольшие раны.",
    bad:"Любой контрудар опасен. Без регена даже мелкие раны накапливаются." },
  { str:1,arm:0,reg:1, name:"Охотник",
    desc:"Средняя атака и средний реген без брони. Бьёт — отступает — залечивается — возвращается. Классический рейдер.",
    good:"Партизанские атаки. Охота на одиночек. После боя быстро восстанавливается.",
    bad:"Без брони хрупок в прямом столкновении. Реген в разгаре боя работает хуже." },
  { str:1,arm:0,reg:2, name:"Вампир",
    desc:"Средняя сила и максимальный реген. Постоянно охотится, постоянно ест, постоянно восстанавливается. Хрупкий, но настойчивый.",
    good:"Против слабых и средних целей. Неустанная охота. Сложно «дожать» — всё время залечивается.",
    bad:"Без брони гибнет от сильного удара. Голод заставляет рисковать. Реген в бою подавлен." },
  { str:1,arm:1,reg:0, name:"Воин",
    desc:"Средняя сила и средняя броня — универсальный боец ближнего боя без регена. Надёжен, предсказуем.",
    good:"Прямые дуэли на равных. Хорошо держит линию. Средняя скорость.",
    bad:"Без регена после первого боя слабеет. Специалист любого типа превзойдёт его." },
  { str:1,arm:1,reg:1, name:"Солдат",
    desc:"Умеренно во всём. Никаких крайностей, никаких явных слабостей. Рабочая лошадка эволюции.",
    good:"Адаптируется к большинству ситуаций. Надёжен. Нет критических уязвимостей.",
    bad:"Проигрывает специализированным противникам. Ни в чём не выдающийся." },
  { str:1,arm:1,reg:2, name:"Паразит",
    desc:"Средняя атака и броня с максимальным реген. Прицепится — не отпустит. Вечно голоден, всё время ест.",
    good:"Затяжные бои. Прилипает к цели и восстанавливается в процессе. Сложно убить.",
    bad:"Против сильных противников брони не хватит. Голод требует постоянной охоты." },
  { str:1,arm:2,reg:0, name:"Страж",
    desc:"Полная броня и средняя атака без регена. Надёжный защитник — кусается достаточно, чтобы отпугнуть. Медленный.",
    good:"Оборонительные позиции. Держит противника. Контролирует проходы.",
    bad:"Без регена накапливает урон. Медлителен. Не догонит лёгкую добычу." },
  { str:1,arm:2,reg:1, name:"Хранитель",
    desc:"Полная броня, средняя атака и средний реген. Живучий боец поддержки — держится долго, кусается умеренно.",
    good:"Танк с зубами. Хорошо на позициях. Восстанавливается между боями.",
    bad:"Медленный. Против быстрых и сильных теряет позицию." },
  { str:1,arm:2,reg:2, name:"Феникс",
    desc:"Полная броня, полный реген, средняя атака. Почти неубиваемый боец средней силы. Голод и медлительность — его кресты.",
    good:"Крайне тяжело убить. Восстанавливается от глубоких ранений. Хорош в обороне.",
    bad:"Медленный. Голод гонит атаковать в невыгодных условиях. Не нанесёт критического удара." },

  { str:2,arm:0,reg:0, name:"Шершень",
    desc:"Максимальная сила, никакой брони, нет регена. Один удар — и цель может не встать. Сам умирает от первого серьёзного ответа.",
    good:"Убийство с одного-двух ударов. Глубокие ранения. Быстрые кусающие атаки по слабым.",
    bad:"Хрупкий как бумага. Без регена — один бой до смерти." },
  { str:2,arm:0,reg:1, name:"Хищник",
    desc:"Максимальная сила и умеренный реген без брони. Убивает и восстанавливается. Хрупкий, но самодостаточный охотник.",
    good:"Охота на добычу любого размера. После боя залечивается и снова в бой.",
    bad:"Без брони любой контрудар опасен. Глубокое ранение может перевесить реген." },
  { str:2,arm:0,reg:2, name:"Чума",
    desc:"Максимальная сила и максимальный реген. Убивает быстро, залечивается быстро. Постоянно голодна и хрупка как яичная скорлупа.",
    good:"Истребление слабых и средних. Непрерывный кровавый натиск. Самодостаточна в охоте.",
    bad:"Без брони гибнет от сильного удара. Голод превращает любую промашку в катастрофу." },
  { str:2,arm:1,reg:0, name:"Берсерк",
    desc:"Полная атака и умеренная броня без регена. Сильный, умеренно защищённый. Бьёт до победы или смерти.",
    good:"Прямые стычки с большинством противников. Ломает броню, наносит глубокие ранения.",
    bad:"Без регена второй бой даётся тяжелее. Против скоростных теряет инициативу." },
  { str:2,arm:1,reg:1, name:"Командир",
    desc:"Полная сила, средняя броня и средний реген. Мощный и живучий — лидер стаи, пробивает линии.",
    good:"Бои против большинства противников. Стабильно опасен. Самодостаточен.",
    bad:"Не лучший против максимально бронированных. В долгих боях реген не всегда успевает." },
  { str:2,arm:1,reg:2, name:"Вирус",
    desc:"Полная сила и полный реген со средней бронёй. Смертоносный, голодный, настойчивый. Настоящая эпидемия.",
    good:"Уничтожение одиночных целей. Затяжные кампании. Восстанавливается даже в бою.",
    bad:"Голод критичен — без добычи погибнет сам. Средняя броня не спасёт от Колосса." },
  { str:2,arm:2,reg:0, name:"Колосс",
    desc:"Полная сила и полная броня. Неостановимая машина разрушения — медленная, неповоротливая, чудовищно опасная при контакте. Нет регена.",
    good:"В прямом столкновении против любого. Проламывает любую оборону. Глубокие ранения сквозь броню.",
    bad:"Самый медленный. Не догонит никого. Без регена долгие кампании изнашивают." },
  { str:2,arm:2,reg:1, name:"Левиафан",
    desc:"Полная сила, полная броня и умеренный реген. Практически неудержим. Медленный, слегка голодный, абсолютно доминирующий.",
    good:"Прямые схватки с кем угодно. Глубокие ранения + броня = непробиваемый дуэлянт.",
    bad:"Скорость катастрофически мала. Реген требует охоты. Лёгкие цели уходят от него." },
  { str:2,arm:2,reg:2, name:"Абсолют",
    desc:"Всё на максимуме. Редчайшее существо — сильнейший удар, непробиваемая броня, безумный реген. Страдает от всех штрафов разом: максимально медленный, вечно голодный, в бою восстановление подавлено.",
    good:"Доминирует в большинстве ситуаций. Почти не имеет слабых мест в прямом бою.",
    bad:"Голод может убить его раньше врагов. Скорость нулевая. В бою реген подавлен. Уязвим для тактики измором." },
];

const FILTERS = [
  { id:"all", label:"Все 27" },
  { id:"str", label:"🔴 Сила" },
  { id:"arm", label:"🔵 Броня" },
  { id:"reg", label:"🟢 Реген" },
  { id:"pure", label:"Чистые" },
  { id:"hybrid", label:"Гибриды" },
];

function dominant(c) {
  const m = Math.max(c.str, c.arm, c.reg);
  if (m === 0) return "none";
  const d = [];
  if (c.str === m) d.push("str");
  if (c.arm === m) d.push("arm");
  if (c.reg === m) d.push("reg");
  return d;
}

function matchFilter(c, f) {
  if (f === "all") return true;
  const d = dominant(c);
  if (f === "str") return d.includes("str");
  if (f === "arm") return d.includes("arm");
  if (f === "reg") return d.includes("reg");
  if (f === "pure") return typeof d === "string" ? true : d.length === 1;
  if (f === "hybrid") return Array.isArray(d) && d.length > 1;
  return true;
}

function StatBar({ val, color, label }) {
  const w = val === 0 ? "w-1/6" : val === 1 ? "w-1/2" : "w-full";
  const bg = color === "str" ? "bg-red-500" : color === "arm" ? "bg-blue-500" : "bg-green-500";
  const tc = color === "str" ? "text-red-400" : color === "arm" ? "text-blue-400" : "text-green-400";
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className={`text-xs w-10 ${tc} font-mono`}>{label}</span>
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${bg} rounded-full transition-all`} style={{width: val === 0 ? "8%" : val === 1 ? "50%" : "100%"}} />
      </div>
      <span className="text-xs text-white/40 w-10 font-mono">{LV_LABEL[val]}</span>
    </div>
  );
}

function CellCard({ c, onClick }) {
  const color = cellRgb(c.str, c.arm, c.reg);
  const glow = cellGlow(c.str, c.arm, c.reg);
  return (
    <div
      onClick={() => onClick(c)}
      className="cursor-pointer rounded-2xl p-4 transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
      style={{
        background: "rgba(10,12,20,0.85)",
        border: `1px solid rgba(${LV[c.str]},${LV[c.reg]},${LV[c.arm]},0.35)`,
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex-shrink-0"
          style={{
            background: `radial-gradient(circle at 38% 38%, rgba(255,255,255,0.35), ${color} 60%)`,
            boxShadow: glow,
          }}
        />
        <div>
          <div className="font-bold text-white text-base leading-tight" style={{fontFamily:"'Cinzel', serif"}}>{c.name}</div>
          <div className="text-xs text-white/40 font-mono mt-0.5">
            {["str","arm","reg"].map((s,i) => (
              <span key={s} className={i===0?"text-red-400/70":i===1?"text-blue-400/70":"text-green-400/70"}>
                {LV_LABEL_SHORT[c[s]]}{i<2?" ":""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-0.5">
        <StatBar val={c.str} color="str" label="Сила" />
        <StatBar val={c.arm} color="arm" label="Броня" />
        <StatBar val={c.reg} color="reg" label="Реген" />
      </div>
    </div>
  );
}

function Modal({ c, onClose }) {
  if (!c) return null;
  const color = cellRgb(c.str, c.arm, c.reg);
  const glow = cellGlow(c.str, c.arm, c.reg);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{background:"rgba(0,0,0,0.75)", backdropFilter:"blur(6px)"}}
      onClick={onClose}
    >
      <div
        className="relative max-w-md w-full rounded-3xl p-6"
        style={{
          background:"rgba(8,10,18,0.97)",
          border:`1.5px solid rgba(${LV[c.str]},${LV[c.reg]},${LV[c.arm]},0.5)`,
          boxShadow: glow,
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white text-xl"
        >✕</button>

        <div className="flex items-center gap-4 mb-5">
          <div
            className="w-16 h-16 rounded-full flex-shrink-0"
            style={{
              background:`radial-gradient(circle at 35% 35%, rgba(255,255,255,0.4), ${color} 65%)`,
              boxShadow: glow,
            }}
          />
          <div>
            <h2 className="text-2xl font-bold text-white" style={{fontFamily:"'Cinzel', serif"}}>{c.name}</h2>
            <div className="text-xs text-white/40 mt-1 font-mono">
              Сила: <span className="text-red-400">{LV_LABEL[c.str]}</span> &nbsp;
              Броня: <span className="text-blue-400">{LV_LABEL[c.arm]}</span> &nbsp;
              Реген: <span className="text-green-400">{LV_LABEL[c.reg]}</span>
            </div>
          </div>
        </div>

        <div className="space-y-1 mb-5">
          <StatBar val={c.str} color="str" label="Сила" />
          <StatBar val={c.arm} color="arm" label="Броня" />
          <StatBar val={c.reg} color="reg" label="Реген" />
        </div>

        <p className="text-white/75 text-sm leading-relaxed mb-4">{c.desc}</p>

        <div className="rounded-xl p-3 mb-3" style={{background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.2)"}}>
          <div className="text-green-400 text-xs font-bold mb-1 uppercase tracking-wider">✦ Хорошо показывает себя</div>
          <p className="text-white/70 text-sm">{c.good}</p>
        </div>
        <div className="rounded-xl p-3" style={{background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)"}}>
          <div className="text-red-400 text-xs font-bold mb-1 uppercase tracking-wider">✦ Слабые места</div>
          <p className="text-white/70 text-sm">{c.bad}</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const visible = CELLS.filter(c => matchFilter(c, filter));

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        body { margin:0; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #050709; }
        ::-webkit-scrollbar-thumb { background: #1e2535; border-radius: 4px; }
        @keyframes pulse-slow { 0%,100%{opacity:0.5} 50%{opacity:1} }
      `}</style>
      <div style={{
        minHeight:"100vh",
        background:"radial-gradient(ellipse 120% 80% at 50% -10%, #0d1a2e 0%, #050709 60%)",
        fontFamily:"'IBM Plex Mono', monospace",
        color:"#e2e8f0",
      }}>
        {/* Header */}
        <div className="px-6 pt-10 pb-6 text-center">
          <div className="text-xs tracking-[0.3em] text-white/30 uppercase mb-2">Биологический атлас</div>
          <h1 style={{fontFamily:"'Cinzel',serif", fontSize:"clamp(1.6rem,4vw,2.4rem)", fontWeight:700, letterSpacing:"0.05em", lineHeight:1.2}}
            className="text-white mb-2">Архетипы Клеток</h1>
          <p className="text-white/40 text-sm max-w-md mx-auto">27 форм жизни &mdash; комбинации силы, брони и регена</p>
          <div className="flex justify-center gap-6 mt-4 text-xs">
            <span className="text-red-400">■ Сила</span>
            <span className="text-blue-400">■ Броня</span>
            <span className="text-green-400">■ Реген</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap justify-center gap-2 px-4 mb-8">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="px-4 py-1.5 rounded-full text-sm transition-all"
              style={{
                background: filter === f.id ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${filter === f.id ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)"}`,
                color: filter === f.id ? "#fff" : "rgba(255,255,255,0.45)",
                fontFamily: "inherit",
              }}
            >{f.label}</button>
          ))}
        </div>

        {/* Grid */}
        <div className="px-4 pb-16 max-w-5xl mx-auto">
          <div style={{
            display:"grid",
            gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))",
            gap:"12px",
          }}>
            {visible.map(c => (
              <CellCard key={`${c.str}${c.arm}${c.reg}`} c={c} onClick={setSelected} />
            ))}
          </div>
          {visible.length === 0 && (
            <div className="text-center text-white/30 py-16">Нет совпадений</div>
          )}
        </div>

        {/* Legend */}
        <div className="text-center pb-8 text-xs text-white/20">
          {LV_LABEL_SHORT[0]} беден &nbsp;|&nbsp; {LV_LABEL_SHORT[1]} богат &nbsp;|&nbsp; {LV_LABEL_SHORT[2]} полон
          &nbsp;&nbsp;·&nbsp;&nbsp; нажми карточку для деталей
        </div>
      </div>

      <Modal c={selected} onClose={() => setSelected(null)} />
    </>
  );
}
