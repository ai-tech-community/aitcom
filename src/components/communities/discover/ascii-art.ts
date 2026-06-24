/**
 * Curated ASCII art for the Town Square Discover page.
 * All art is decorative and rendered aria-hidden; real headings/labels
 * carry the accessible structure, and the empty-state copy is rendered
 * beside the figure (not baked into the art).
 *
 * Attribution policy: artist initials are preserved inside each piece
 * per the ASCII art community convention.
 */

// source: https://oldcompcz.github.io/jgs/joan_stark/build.html
// "city skyline" by Joan G. Stark (jgs), dated 5/97
// Max width: 56 cols. Renders at text-[10px]/text-xs without overflow.
/** A city skyline — the Discover hero banner. */
export const TOWN_SQUARE_BANNER = String.raw`
                       .|
                       | |
                       |'|            ._____
               ___    |  |            |.   |' .---"|
       _    .-'   '-. |  |     .--'|  ||   | _|    |
    .-'|  _.|  |    ||   '-__  |   |  |    ||      |
    |' | |.    |    ||       | |   |  |    ||      |
 ___|  '-'     '    ""       '-'   '-.'    ''      |____
jgs~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`;

// source: https://ascii.co.uk/art/village
// "village scene" by Steven Maddison, 2014
// Max width: 32 cols. Renders at text-[10px] without overflow.
/** A small quiet village corner — used in empty states (copy renders beside it). */
export const QUIET_SQUARE = String.raw`
  ~         ~~          __
       _T      .,,.    ~--~ ^^
 ^^   // \                    ~
      ][O]    ^^      ,-~ ~
   /''-I_I         _II____
__/_  /   \ ______/ ''   /'\_ ,__
  | II--'''' \,--:--..,_/,.-{ },
; '/__\,.--';|   |[] .-.| O{ _ }
:' |  | []  -|   ''--:.;[,.'\ ,/
'  |[]|,.--'' '',   ''-,.    |
  ..    ..-''    ;       ''. '`;
