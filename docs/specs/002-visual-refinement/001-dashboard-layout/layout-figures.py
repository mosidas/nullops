# 12 列 × 16 行の格子を等幅の図に描く。列 1 つ = 5 文字、行 1 つ = 1 行。
COLS, ROWS, CW = 12, 16, 5
PLANS = {
 "A": [("LOG",0,0,4,16),("TIME",4,0,8,6),("COMMIT",4,6,2,7),("DEP",6,6,3,7),("3D",9,6,3,7),("GAUGE",4,13,8,3)],
 "B": [("GAUGE",0,0,3,4),("TIME",3,0,9,4),("COMMIT",0,4,3,7),("DEP",3,4,4,7),("3D",7,4,5,7),("LOG",0,11,12,5)],
 "C": [("GAUGE",0,0,2,5),("TIME",2,0,10,5),("COMMIT",0,5,2,11),("DEP",2,5,4,6),("3D",2,11,4,5),("LOG",6,5,6,11)],
 "D": [("TIME",0,0,10,4),("GAUGE",10,0,2,4),("LOG",0,4,4,12),("3D",4,4,5,12),("DEP",9,4,3,6),("COMMIT",9,10,3,6)],
}
def render(panels):
    W, H = COLS*CW+1, ROWS+1
    g = [[" "]*W for _ in range(H)]
    for name,x,y,w,h in panels:
        x0,x1,y0,y1 = x*CW, (x+w)*CW, y, y+h
        for cx in range(x0,x1+1):
            g[y0][cx] = "-"; g[y1][cx] = "-"
        for cy in range(y0,y1+1):
            g[cy][x0] = "|"; g[cy][x1] = "|"
        for cx,cy in ((x0,y0),(x1,y0),(x0,y1),(x1,y1)):
            g[cy][cx] = "+"
    hs, vs = set(), set()
    for name,x,y,w,h in panels:
        x0,x1,y0,y1 = x*CW, (x+w)*CW, y, y+h
        for cx in range(x0,x1+1): hs.add((cx,y0)); hs.add((cx,y1))
        for cy in range(y0,y1+1): vs.add((x0,cy)); vs.add((x1,cy))
    for (cx,cy) in hs & vs: g[cy][cx] = "+"
    for name,x,y,w,h in panels:
        lab = f" {name} "
        cx = x*CW+1; cy = y+1 if h>1 else y
        for i,ch in enumerate(lab): g[cy][cx+i] = ch
    return "\n".join("".join(r).rstrip() for r in g)
import sys
for k,p in PLANS.items():
    assert sum(w*h for _,x,y,w,h in p) == COLS*ROWS, k
    print(f"== {k}"); print(render(p)); print()
