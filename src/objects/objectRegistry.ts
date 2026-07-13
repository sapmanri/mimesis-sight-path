export type ObjectRarity = 'common' | 'uncommon' | 'rare';
export type ObjectDrive = 'observe' | 'rest' | 'record' | 'wonder';

export type ObjectRegistryEntry = {
  id: string;
  label: string;
  category: string;
  rarity: ObjectRarity;
  drives?: Partial<Record<ObjectDrive, number>>;
  journalTags?: string[];
  variants?: string[];
  views: {
    twoD?: { enabled: boolean; emoji: string; spawnWeight?: number; rareEvent?: boolean; special?: boolean };
    threeD?: { enabled: boolean; catalogCategory: string; assetId?: string; animated?: boolean };
  };
};

const twoD = (id:string,label:string,category:string,emoji:string,rarity:ObjectRarity,spawnWeight:number,drives:Partial<Record<ObjectDrive,number>>,journalTags:string[],variants:string[]=[],extra:Partial<NonNullable<ObjectRegistryEntry['views']['twoD']>>={}):ObjectRegistryEntry => ({
  id,label,category,rarity,drives,journalTags,variants,views:{twoD:{enabled:true,emoji,spawnWeight,...extra}},
});
const threeD = (id:string,label:string,catalogCategory:string,animated=false):ObjectRegistryEntry => ({
  id,label,category:catalogCategory,rarity:'common',views:{threeD:{enabled:true,catalogCategory,assetId:id,animated}},
});
const both = (entry:ObjectRegistryEntry,catalogCategory:string,assetId=entry.id,animated=false):ObjectRegistryEntry => ({
  ...entry,views:{...entry.views,threeD:{enabled:true,catalogCategory,assetId,animated}},
});

/** One object identity source. Renderers remain view-specific adapters. */
export const OBJECT_REGISTRY:ObjectRegistryEntry[] = [
  twoD('flower','꽃','nature','🌼','common',6,{observe:.32,wonder:.12},['예쁘다','조용','이름모름'],['','비온뒤','담벼락옆','시든']),
  twoD('flowerbed','꽃밭','nature','🌷','common',2,{observe:.30,wonder:.18,record:.10},['잔뜩','색색']),
  twoD('dandelion','홀씨','nature','🌱','uncommon',1,{wonder:.30,observe:.16},['후','날아감','소원']),
  twoD('leaves','낙엽','nature','🍂','common',2,{observe:.20,rest:.10,record:.12},['바스락','가을']),
  both(twoD('sapling','작은나무','nature','🌿','common',2,{observe:.22,wonder:.14},['자라는중','작다']),'자연','tree'),
  twoD('oldtree','큰나무','nature','🌳','uncommon',1,{observe:.24,rest:.16,wonder:.14},['오래됨','그늘','든든']),
  twoD('puddle','웅덩이','nature','💧','common',2,{observe:.20,wonder:.24,record:.14},['비온뒤','비침','첨벙'],['','하늘비친','작은']),
  both(twoD('stone','돌멩이','nature','🪨','common',2,{observe:.16,wonder:.10},['그냥돌','매끈']),'자연','rock-small'),
  both(twoD('bench','벤치','rest','🪑','common',3,{rest:.38,observe:.10},['앉음','누가앉았나','쉼']),'구조물','chair'),
  twoD('busseat','정류장','rest','🚏','common',1,{rest:.34,wonder:.12},['기다림','아무도없음']),
  both(twoD('wall','담장','rest','🧱','common',2,{rest:.24,observe:.16},['낮다','걸터앉음']),'구조물','wall-stone'),
  twoD('stairs','계단','rest','🪜','uncommon',1,{rest:.28,observe:.14},['그늘','한칸씩']),
  twoD('platform','평상','rest','🟫','uncommon',1,{rest:.40,observe:.12},['드러눕고싶다','시원']),
  twoD('ppaekkong','빼콩이','animal','🐈‍⬛','uncommon',1,{wonder:.30,record:.24,observe:.16},['빼콩이다','우리집','따라가고싶다'],[],{special:true}),
  twoD('streetcat','길고양이','animal','🐈','common',2,{wonder:.26,observe:.18,record:.14},['낯선','도망감','눈맞춤'],['','흰','얼룩','자는']),
  twoD('sparrow','참새','animal','🐦','common',2,{observe:.22,wonder:.20,record:.12},['포르르','짹짹','금방감']),
  twoD('butterfly','나비','animal','🦋','common',2,{wonder:.28,observe:.20,record:.16},['팔랑','쫓아감','예쁘다']),
  twoD('snail','달팽이','animal','🐌','uncommon',1,{observe:.26,wonder:.18},['느리다','기다려줌']),
  twoD('mailbox','우체통','thing','📮','uncommon',2,{record:.26,observe:.10,wonder:.08},['편지','기다림','안열림'],['','빨간','녹슨']),
  twoD('sign','표지판','thing','🪧','common',2,{record:.22,observe:.14},['오래됨','글씨흐림']),
  twoD('board','게시판','thing','📋','common',1,{record:.24,observe:.16,wonder:.10},['공지','누가붙임']),
  twoD('bicycle','자전거','thing','🚲','common',3,{observe:.16,record:.18,wonder:.10},['세워둠','주인은']),
  twoD('window','창문','thing','🪟','common',3,{observe:.18,wonder:.20,record:.12},['불켜짐','안이궁금'],['','불켜진','커튼친']),
  both(twoD('lamp','가로등','thing','💡','common',2,{observe:.14,record:.14,rest:.10},['저녁','노란빛']),'구조물','streetlamp'),
  // ==== BUILD 409-A: 길가 식물과 작은 자연 25종 ====
  twoD('azalea','철쭉','nature','🌸','common',3,{observe:.30,wonder:.16},['봄','무더기','분홍'],['','분홍','흰']),
  twoD('forsythia','개나리','nature','🌼','common',3,{observe:.28,wonder:.14},['노랑','담장','봄먼저']),
  twoD('lilac','라일락','nature','🌸','common',3,{observe:.28,wonder:.18,record:.10},['향기','연보라','오월']),
  twoD('sunflower','해바라기','nature','🌻','common',3,{observe:.32,wonder:.16},['키큰','해쪽','여름']),
  twoD('marigold','금잔화','nature','🌼','common',3,{observe:.26,record:.10},['주황','텃밭가','촘촘']),
  twoD('morningglory','나팔꽃','nature','🌺','common',3,{observe:.28,wonder:.18},['아침','담쟁이옆','금방짐'],['','보라','파랑']),
  twoD('chrysanthemum','국화','nature','🌼','common',3,{observe:.28,record:.12},['가을','노랑','한무리']),
  twoD('lavender','라벤더','nature','🌸','uncommon',2,{observe:.26,rest:.16,wonder:.14},['향기','보라','줄지어']),
  twoD('wildrose','찔레꽃','nature','🌷','common',2,{observe:.26,wonder:.16},['흰','가시','울타리'],['','흰','연분홍']),
  twoD('bamboo','대나무','nature','🎋','uncommon',2,{observe:.24,rest:.14,wonder:.12},['서걱','키큰','그늘']),
  twoD('pinecone','솔방울','nature','🌰','common',3,{observe:.22,wonder:.12},['떨어짐','갈색','오돌']),
  twoD('acornpile','도토리 더미','nature','🌰','common',3,{observe:.22,record:.10},['가을','다람쥐몫','모임']),
  twoD('mushroom','버섯','nature','🍄','common',3,{observe:.26,wonder:.18},['비온뒤','그늘','작다'],['','빨간','갈색']),
  twoD('mushroomring','버섯 무리','nature','🍄','uncommon',2,{observe:.28,wonder:.20},['둥글게','여럿','숲가']),
  twoD('cattail','부들','nature','🌾','common',2,{observe:.24,rest:.12},['물가','갈색이삭','흔들']),
  twoD('lotusleaf','연잎','nature','🪷','uncommon',2,{observe:.28,wonder:.16,record:.10},['물위','둥글','이슬굴림']),
  twoD('waterlily','수련','nature','🪷','uncommon',2,{observe:.30,wonder:.18},['물위','하양','고요']),
  twoD('wildgrass','들풀','nature','🌿','common',4,{observe:.20},['흔한','바람','이름모름']),
  twoD('thornbush','가시덤불','nature','🌿','common',2,{observe:.22,wonder:.10},['가시','엉킴','건드리지마']),
  twoD('fallenbranch','떨어진 나뭇가지','nature','🪵','common',3,{observe:.20,record:.10},['바람뒤','길가','밟힘']),
  twoD('tree-stump','그루터기','nature','🪵','common',2,{observe:.22,rest:.16},['앉을만','나이테','오래됨']),
  twoD('pebblepile','자갈더미','nature','🪨','common',3,{observe:.18},['모임','작은돌','길가']),
  twoD('dewgrass','이슬 맺힌 풀','nature','🌱','uncommon',2,{observe:.28,wonder:.18,record:.12},['아침','반짝','금방마름']),
  twoD('spiderweb','거미줄','nature','🕸️','uncommon',2,{observe:.26,wonder:.20},['아침빛','아무도없음','가느다란']),
  twoD('birdnest','새 둥지','nature','🪺','uncommon',1,{observe:.28,wonder:.20,record:.12},['비어있음','나뭇가지','조심']),
  // ---- BUILD 408-B: 식물 10종 ----
  twoD('hydrangea','수국','nature','🌸','common',3,{observe:.32,wonder:.18,record:.10},['비온뒤','담장옆','둥글게핌'],['','비온뒤','담벼락옆']),
  twoD('hollyhock','접시꽃','nature','🌺','common',2,{observe:.28,wonder:.14},['키큰','길가','한줄로'],['','분홍','흰']),
  twoD('fern','고사리','nature','🌿','common',3,{observe:.26},['그늘밑','돌돌말림','축축']),
  twoD('ivy','담쟁이','nature','🍃','common',2,{observe:.24,wonder:.16},['담벼락','타고오름','초록빛'],['','담벼락','붉게물든']),
  twoD('reed','갈대','nature','🌾','common',3,{observe:.24,rest:.14},['바람따라','강가','서걱']),
  twoD('cosmos','코스모스','nature','🌸','common',3,{observe:.30,record:.12},['가을','한들','길가에'],['','분홍','흰','무리']),
  twoD('camellia','동백','nature','🌺','uncommon',2,{observe:.30,wonder:.18},['겨울꽃','붉다','툭떨어짐'],['','붉은','떨어진']),
  twoD('clover','토끼풀','nature','☘️','common',4,{wonder:.22,observe:.18},['네잎찾기','자잘','풀밭']),
  twoD('mossrock','이끼 낀 돌','nature','🪨','common',2,{observe:.24,rest:.14},['오래됨','초록옷','축축']),
  twoD('seedhead','민들레 홀씨','nature','🌱','uncommon',2,{wonder:.32,observe:.16},['후','흩어짐','바람'],['','온전한','반쯤날린']),
  // ---- BUILD 408-B: 생활 사물 10종 ----
  twoD('laundryline','빨랫줄','thing','🧺','common',2,{observe:.28,wonder:.16,record:.10},['바람걸림','흔들림','누구네']),
  twoD('wateringcan','물뿌리개','thing','🪣','common',3,{observe:.22},['문앞','녹슨','누가둠'],['','녹슨','파란']),
  twoD('rubberboots','장화','thing','🥾','common',3,{observe:.24,wonder:.14},['문앞','한켤레','하루쉼'],['','노란','흙묻은']),
  twoD('milkcrate','우유 상자','thing','📦','common',2,{observe:.20,rest:.12},['쌓임','플라스틱','앉을만']),
  twoD('broom','빗자루','thing','🧹','common',3,{observe:.20},['기대둠','벽옆','다쓴']),
  twoD('jar','유리병','thing','🫙','common',2,{observe:.22,record:.14},['빛투과','비어있음','창가'],['','빈','물담긴']),
  twoD('woodpile','장작더미','thing','🪵','uncommon',2,{observe:.24,rest:.14},['쌓임','겨울준비','가지런']),
  twoD('oldchair','낡은 의자','rest','🪑','common',2,{rest:.34,observe:.16},['아무도','기울어짐','비었다'],['','나무','칠벗겨진']),
  twoD('bucket','양동이','thing','🪣','common',3,{observe:.20},['엎어둠','빗물','구석']),
  twoD('windchime','풍경','thing','🎐','uncommon',2,{wonder:.30,observe:.16},['처마밑','작은소리','바람보다먼저']),
  twoD('rainbow','무지개','rare','🌈','rare',0,{wonder:.5,observe:.3,record:.3},['무지개다','오늘운좋다'],[],{rareEvent:true}),
  twoD('shootstar','별똥별','rare','🌠','rare',0,{wonder:.6,record:.3},['소원','순식간'],[],{rareEvent:true}),
  twoD('letter','길위편지','rare','✉️','rare',0,{record:.5,wonder:.3,observe:.2},['누가흘림','주울까'],[],{rareEvent:true}),
  twoD('whitecat','흰고양이','rare','🐈','rare',0,{wonder:.5,observe:.3,record:.3},['처음보는','새하얀'],[],{rareEvent:true}),

  threeD('rock-small','작은 바위','자연'),threeD('rock-big','큰 바위','자연'),threeD('stone-tall','선 돌','자연'),threeD('slab','바위 슬랩 (대형)','자연'),threeD('bush','수풀','자연'),threeD('tree','작은 나무','자연'),threeD('grass','풀 다발','자연'),
  threeD('cabin','오두막','구조물'),threeD('tent','텐트 (캠프)','구조물'),threeD('lighthouse','등대','구조물'),threeD('door','초록 대문','구조물'),threeD('wall-stone','돌담 조각','구조물'),threeD('chair','의자','구조물'),threeD('streetlamp','가로등 (불빛)','구조물'),threeD('lantern','랜턴 (불빛)','구조물'),threeD('oldcar','낡은 차','구조물'),threeD('plane','비행기','구조물'),
  threeD('suitcase','캐리어','기억 사물'),threeD('book','책 무더기','기억 사물'),threeD('cup','찻잔','기억 사물'),threeD('fruit','과일','기억 사물'),threeD('cd-shelf','CD 선반','기억 사물'),threeD('sea-edge','바다의 가장자리','기억 사물'),
  threeD('person','사람 실루엣','사람'),threeD('rogue','두건 나그네','사람',true),threeD('scavenger','방랑자','사람',true),threeD('rabbit','토끼','동물',true),threeD('flag','국기 깃발 (폽)','지구본'),threeD('cow','젖소','동물',true),threeD('dog','강아지','동물',true),threeD('duck','오리','동물',true),threeD('chicky','병아리','동물',true),threeD('horse','말','동물',true),threeD('piggy','돼지','동물',true),threeD('bear','곰','동물',true),threeD('deer','사슴','동물',true),threeD('boar','멧돼지','동물',true),threeD('wolf','늑대','동물',true),
  threeD('cowshed','외양간','구조물'),threeD('moon','달','하늘'),threeD('trainloco','기관차','철길'),threeD('wagon2','객차','철길'),threeD('signallight','신호등','철길'),threeD('railsection','철길 조각','철길'),threeD('windturbine','풍력발전기 (부유·회전)','하늘'),threeD('snowyhouse','눈 덮인 집','겨울'),threeD('snowman','눈사람','겨울'),threeD('pinesnow','눈 소나무 군락','겨울'),threeD('cloud','뭉게구름','하늘'),threeD('cloud-dark','먹구름','하늘'),
];

export const registryFor2D=()=>OBJECT_REGISTRY.filter((e)=>e.views.twoD?.enabled);
export const registryFor3D=()=>OBJECT_REGISTRY.filter((e)=>e.views.threeD?.enabled);

export function serialize2DRegistry(){
  const catalog:Record<string,unknown>={},variants:Record<string,string[]>={},rare:Record<string,unknown>={},plan:Record<string,number>={};
  for(const entry of registryFor2D()){
    const view=entry.views.twoD!;
    const def={emoji:view.emoji,ko:entry.label,cat:entry.category,stim:entry.drives??{},jtags:entry.journalTags??[],rarity:entry.rarity,...(view.special?{special:true}:{})};
    if(view.rareEvent) rare[entry.id]=def; else {catalog[entry.id]=def;if((view.spawnWeight??0)>0) plan[entry.id]=view.spawnWeight;}
    if(entry.variants?.length) variants[entry.id]=entry.variants;
  }
  return {catalog,variants,rare,plan};
}

export function validateObjectRegistry(){
  const errors:string[]=[];
  for(const entry of OBJECT_REGISTRY){
    if(!entry.id.trim()) errors.push('empty object id');
    if(!entry.views.twoD&&!entry.views.threeD) errors.push(`object has no view: ${entry.id}`);
    if(entry.views.twoD?.enabled&&!entry.views.twoD.rareEvent&&(entry.views.twoD.spawnWeight??0)<0) errors.push(`negative spawn weight: ${entry.id}`);
  }
  return errors;
}
