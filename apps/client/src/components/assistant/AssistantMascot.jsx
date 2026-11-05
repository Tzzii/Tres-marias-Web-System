import { useId } from 'react';
import './assistantMascot.css';

/** A native illustration: independently animated head, eyes and waving arm; no image/video requests. */
export default function AssistantMascot({ portrait = false, className = '' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className={`tm-assistant-mascot ${className}`}
      viewBox={portrait ? '36 3 132 144' : '0 0 200 240'}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-ivory`} x1="55" y1="60" x2="151" y2="190" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFDF8" />
          <stop offset="0.52" stopColor="#F9F1E3" />
          <stop offset="1" stopColor="#E6D4B5" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="58" y1="120" x2="139" y2="189" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EED5A1" />
          <stop offset="0.55" stopColor="#C6A15C" />
          <stop offset="1" stopColor="#96703B" />
        </linearGradient>
        <linearGradient id={`${id}-screen`} x1="66" y1="69" x2="131" y2="126" gradientUnits="userSpaceOnUse">
          <stop stopColor="#493B31" />
          <stop offset="1" stopColor="#251E1A" />
        </linearGradient>
      </defs>
      {!portrait && (
        <ellipse
          className="tm-assistant-mascot__shadow"
          cx="101"
          cy="226"
          rx="54"
          ry="7"
          fill="#5D4125"
          opacity="0.13"
        />
      )}
      <g className="tm-assistant-mascot__float">
        {!portrait && (
          <g className="tm-assistant-mascot__body">
            <path d="M75 196L72 214M125 196L130 214" stroke="#A47F46" strokeWidth="12" strokeLinecap="round" />
            <path
              d="M58 217C58 211 66 207 76 210L87 219C88 223 83 226 76 226H63C58 226 55 222 58 217Z"
              fill="#3E3027"
            />
            <path
              d="M116 219L126 210C135 207 144 212 145 217C147 222 144 226 138 226H124C117 226 113 223 116 219Z"
              fill="#3E3027"
            />
            <path d="M62 222H80M122 222H140" stroke="#E8D6B7" strokeWidth="2" strokeLinecap="round" />
            <path d="M66 151C54 151 48 158 45 175" stroke="#B28C51" strokeWidth="17" strokeLinecap="round" />
            <path d="M65 149C54 150 49 159 47 170" stroke="#F5E9D5" strokeWidth="11" strokeLinecap="round" />
            <circle cx="45" cy="175" r="10" fill={`url(#${id}-ivory)`} stroke="#B28C51" strokeWidth="2" />
            <path
              d="M69 143C77 136 124 136 134 145L143 185C146 199 133 208 120 209H80C66 208 56 200 59 185L69 143Z"
              fill={`url(#${id}-ivory)`}
              stroke="#B99257"
              strokeWidth="2.5"
            />
            <path d="M80 149L100 160L121 149L127 194C114 202 86 202 73 194L80 149Z" fill={`url(#${id}-gold)`} />
            <path d="M88 145L100 154L111 145" stroke="#FFFDF8" strokeWidth="5" strokeLinejoin="round" />
            <path d="M89 157L99 161L89 166V157ZM110 157L100 161L110 166V157Z" fill="#49372B" />
            <circle cx="100" cy="161" r="2.5" fill="#6B4B2D" />
            <rect x="83" y="174" width="34" height="21" rx="10.5" fill="#FFFAEE" fillOpacity="0.93" />
            <text
              x="100"
              y="189"
              textAnchor="middle"
              fill="#7C5A2C"
              fontSize="13"
              fontWeight="700"
              fontFamily="Arial, sans-serif"
            >
              AI
            </text>
            <path
              d="M25 171H60M29 166C30 156 35 151 42 151C50 151 55 157 56 166H29Z"
              stroke="#9C763E"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="#EED7AC"
            />
            <circle cx="42" cy="149" r="3" fill="#9C763E" />
          </g>
        )}
        {!portrait && (
          <g className="tm-assistant-mascot__wave">
            <path d="M136 157C153 157 161 143 165 125" stroke="#A78149" strokeWidth="17" strokeLinecap="round" />
            <path d="M139 155C151 154 157 142 160 133" stroke="#F5E9D5" strokeWidth="11" strokeLinecap="round" />
            <path
              d="M157 130L153 118C152 114 155 111 158 115L162 119L160 104C160 100 164 99 165 103L167 114L170 100C171 97 175 98 174 102L173 115L178 105C180 102 184 104 182 108L177 122C175 130 168 136 162 133L157 130Z"
              fill={`url(#${id}-ivory)`}
              stroke="#B28C51"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </g>
        )}
        <g className="tm-assistant-mascot__head">
          <rect
            x="47"
            y="54"
            width="108"
            height="88"
            rx="37"
            fill={`url(#${id}-ivory)`}
            stroke="#B99257"
            strokeWidth="2.5"
          />
          <path d="M58 63C63 57 72 55 83 55H121" stroke="#FFFDF8" strokeWidth="4" strokeLinecap="round" />
          <rect x="58" y="67" width="86" height="61" rx="25" fill={`url(#${id}-screen)`} />
          <path d="M67 79C72 72 82 72 91 72" stroke="#796453" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
          <g className="tm-assistant-mascot__eyes">
            <rect x="77" y="86" width="10" height="17" rx="5" fill="#FFF5D9" />
            <rect x="116" y="86" width="10" height="17" rx="5" fill="#FFF5D9" />
            <circle cx="80" cy="89" r="2" fill="#FFFFFF" />
            <circle cx="119" cy="89" r="2" fill="#FFFFFF" />
          </g>
          <ellipse cx="70" cy="108" rx="6" ry="3" fill="#E1AF92" opacity="0.5" />
          <ellipse cx="133" cy="108" rx="6" ry="3" fill="#E1AF92" opacity="0.5" />
          <path d="M91 111C96 117 106 117 111 111" stroke="#EBD1A1" strokeWidth="3" strokeLinecap="round" />
          <path
            d="M43 91C42 52 66 40 101 40C136 40 160 55 160 92"
            stroke="#9B773F"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <rect
            x="36"
            y="85"
            width="15"
            height="29"
            rx="7.5"
            fill={`url(#${id}-gold)`}
            stroke="#9B773F"
            strokeWidth="2"
          />
          <rect
            x="152"
            y="85"
            width="15"
            height="29"
            rx="7.5"
            fill={`url(#${id}-gold)`}
            stroke="#9B773F"
            strokeWidth="2"
          />
          <path d="M160 111C158 131 144 134 129 134" stroke="#9B773F" strokeWidth="3.5" strokeLinecap="round" />
          <rect x="119" y="130" width="17" height="8" rx="4" fill="#4A382B" />
          <path
            d="M66 53L61 43C43 42 45 21 62 19C64 4 86 3 94 15C106 1 126 9 129 22C147 20 153 43 135 47L131 55H66Z"
            fill="#FFFCF6"
            stroke="#BB995F"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M68 48H130L128 59H70L68 48Z" fill="#F0DFBE" stroke="#BB995F" strokeWidth="1.5" />
          <path d="M85 27L87 43M111 26L109 43" stroke="#E9D9BE" strokeWidth="2" strokeLinecap="round" />
        </g>
        {!portrait && (
          <g className="tm-assistant-mascot__sparkles" fill="#C6A15C">
            <path d="M26 64L29 73L38 76L29 79L26 88L23 79L14 76L23 73Z" />
            <path d="M174 40L176 46L182 48L176 50L174 56L172 50L166 48L172 46Z" />
          </g>
        )}
      </g>
    </svg>
  );
}
