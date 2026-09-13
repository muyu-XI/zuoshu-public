export default function WateringMascot() {
  return (
    <div className="watering-scene" aria-label="刘看山给植物浇水" role="img">
      <svg viewBox="0 0 360 190" aria-hidden="true">
        <ellipse cx="180" cy="177" rx="125" ry="7" fill="#e0e8d2" />
        <g className="watering-mascot">
          <path d="M70 145Q47 139 48 154Q50 169 74 166L94 157" fill="#fffef9" stroke="#d5d9cf" strokeWidth="3" />
          <path d="M84 42Q89 18 104 34L128 62L148 63L166 36Q177 22 184 41L197 72Q218 87 199 111L181 120L181 147Q180 167 151 171L110 167Q87 160 85 145Z" fill="#fffef9" stroke="#d5d9cf" strokeWidth="3" />
          <path d="M98 48L96 72L116 66Z M169 51L157 70L177 72Z" fill="#e8ebe4" />
          <ellipse cx="133" cy="83" rx="5" ry="7" fill="#303331" />
          <path d="M180 71Q195 61 207 72Q217 83 209 98Q200 111 185 105Q172 100 173 87Z" fill="#303331" />
          <path d="M166 113Q170 120 179 116" fill="none" stroke="#303331" strokeWidth="3" strokeLinecap="round" />
          <path className="watering-arm" d="M173 119Q197 119 213 135" fill="none" stroke="#303331" strokeWidth="14" strokeLinecap="round" />
          <path className="watering-can" d="M202 111L250 127L239 163L190 146Z" fill="#98a6aa" />
          <path d="M240 130L270 111L281 119L247 149Z" fill="#98a6aa" />
          <path d="M205 116Q190 91 171 104" fill="none" stroke="#98a6aa" strokeWidth="7" strokeLinecap="round" />
          <path d="M112 166L111 177M151 166L155 177" stroke="#303331" strokeWidth="13" strokeLinecap="round" />
        </g>
        <g className="watering-plant">
          <path d="M286 171Q288 136 286 112" stroke="#7c9b4a" strokeWidth="7" strokeLinecap="round" />
          <ellipse cx="270" cy="117" rx="17" ry="30" transform="rotate(-42 270 117)" fill="#a9c66b" />
          <ellipse cx="303" cy="101" rx="15" ry="29" transform="rotate(38 303 101)" fill="#8eaf51" />
          <path d="M249 172Q286 143 321 172Z" fill="#a8774d" />
        </g>
        <g className="watering-drops" fill="#66b9d2">
          <path d="M270 132Q276 143 270 149Q264 143 270 132Z" />
          <path d="M282 137Q288 148 282 154Q276 148 282 137Z" />
          <path d="M294 130Q300 141 294 147Q288 141 294 130Z" />
          <path d="M305 136Q311 147 305 153Q299 147 305 136Z" />
        </g>
      </svg>
    </div>
  );
}
