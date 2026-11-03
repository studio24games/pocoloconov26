import json,sys,os
# knobs from argv as k=v
kv=dict(a.split('=') for a in sys.argv[1:]); g=lambda k,d: float(kv.get(k,d))
w50=int(g('w50',1570)); mini=int(g('mini',420)); minor=int(g('minor',210)); major=int(g('major',18))
bw3=int(g('bw3',1500)); bmini=int(g('bmini',330)); bminor=int(g('bminor',200)); bmajor=int(g('bmajor',22))
bhit=int(g('bhit',150)); bx10=int(g('bx10',140)); bstart=int(g('bstart',90)); bper=int(g('bper',18)); bcap=int(g('bcap',260))
sx10=int(g('sx10',190)); grow=int(g('grow',34)); bgrow=int(g('bgrow',50))
E=[[50,w50],[100,1805],[200,1600],[300,1400],[500,1300],[800,798],[1000,293],["MINI",mini],["MINOR",minor],["MAJOR",major],["GRAND",3]]
B=([[200,int(g("b2",0))]] if g("b2",0)>0 else [])+[[300,bw3],[500,int(g("b5",1500))],[800,int(g("b8",900))],[1000,int(g("b10",330))],["MINI",bmini],["MINOR",bminor],["MAJOR",bmajor],["GRAND",2]]
su=int(g("su50",950)); su1=int(g("su100",1677))
SE=[[50,su],[100,su1],[200,1600],[300,1400],[500,1300],[800,798],[1000,293],["MINI",420],["MINOR",int(g("sminor",100))],["MAJOR",14],["GRAND",3]]
SL=[[50,int(su*1.2)],[100,int(su1*1.05)],[200,1600],[300,1300],[500,1150],[800,650],[1000,230],["MINI",380],["MINOR",int(g("sminor",100)*0.9)],["MAJOR",12],["GRAND",3]]
T={"superEarly":SE,"superLast":SL,"base":[[50,1205],[100,1805],[200,1600],[300,1400],[500,1300],[800,798],[1000,293],["MINI",210],["MINOR",50],["MAJOR",11],["GRAND",2]],
 "early":E,"late":E,"buyStart":[[300,int(g("s3",1200))],[500,int(g("s5",1500))],[800,int(g("s8",900))],[1000,int(g("s10",330))],["MINI",60],["MINOR",12]],"buyEarly":B,"buyLate":B}
wh=[["MINI",30],["MINOR",55],["MAJOR",12],["GRAND",3]]
U={"FEATURE":{"collector":None,"jackpotHeldPick":850,"frames":{"mult":[[2,160],[3,230],[5,320],[10,sx10],[20,60],[50,25]]},"jackpotGrow":{"num":grow,"which":wh}},
 "SUPER":{"collector":None,"jackpotHeldPick":700},
 "MODES":{"buy":{"startCoins":[[4,80],[5,20]],"coinTable":"buyStart","extraOpeningFrames":[[0,1]],
   "feature":{"collector":None,"jackpotHeldPick":850,"openingFrames":{"count":[[2,80],[1,20]],"mult":[[2,70],[3,25],[5,5]]},"jackpotGrow":{"num":bgrow,"which":wh},
     "cellHit":{"byHeld":{"4":bhit,"5":bhit,"6":int(g("bh6",bhit-5)),"7":int(g("bh7",bhit-10)),"8":int(g("bf8",8)),"9":int(g("bf9",6))}},
     "frames":{"start":bstart,"perRespin":bper,"cap":bcap,"max":5,"mult":[[2,470],[3,260],[5,130],[10,bx10]],"bigOnEmpty":{"from":10,"num":int(g("bempty",950))}}}}}}
print(json.dumps(T)); print(json.dumps(U))
