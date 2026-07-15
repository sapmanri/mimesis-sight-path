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
  // ==== BUILD 409-D: 길가 구조물과 계절 흔적 25종 ====
  twoD('stonewall','돌담','rest','🧱','common',3,{observe:.20,rest:.16},['낮다','이끼','걸터앉음']),
  twoD('woodfence','나무 울타리','thing','🪵','common',3,{observe:.18,rest:.10},['낡음','밭경계','기울어짐']),
  twoD('garden-gate','작은 대문','thing','🚪','uncommon',2,{observe:.22,wonder:.14,record:.10},['녹슨','삐걱','누구네'],['','초록','파랑']),
  twoD('footbridge','작은 다리','rest','🌉','uncommon',1,{observe:.24,rest:.16,wonder:.14},['개울','나무판','건너감']),
  twoD('drain','배수로','thing','🕳️','common',2,{observe:.16},['졸졸','콘크리트','비온뒤']),
  twoD('manhole','맨홀','thing','⚫','common',2,{observe:.16,wonder:.10},['철제','길가운데','둥근']),
  twoD('roadmirror','도로 반사경','thing','🪞','uncommon',2,{observe:.22,wonder:.16},['모퉁이','볼록','비침']),
  twoD('telephonepole','전봇대','thing','📞','common',2,{observe:.16,record:.10},['높다','전선','오래됨']),
  twoD('powerbox','전기함','thing','🔌','common',2,{observe:.16},['초록','길가','붙은스티커']),
  twoD('bus-sign','버스 표지','rest','🚏','common',2,{rest:.24,observe:.16,wonder:.12},['기다림','시간표','아무도']),
  twoD('vendingmachine','자판기','thing','🥤','uncommon',2,{observe:.22,record:.12,rest:.10},['불빛','윙윙','시골에도']),
  twoD('shed','작은 창고','thing','🏚️','uncommon',1,{observe:.22,rest:.12},['양철','잠김','농기구']),
  twoD('greenhouse','비닐하우스','thing','🏭','uncommon',1,{observe:.24,record:.12},['반투명','밭','따뜻']),
  twoD('well','우물','rest','⛲','uncommon',1,{observe:.26,rest:.16,wonder:.16},['오래됨','두레박','깊다']),
  twoD('birdhouse','새집','nature','🏠','uncommon',2,{observe:.24,wonder:.20,record:.12},['나무','작은구멍','누가살까']),
  twoD('fallenpetals','떨어진 꽃잎','nature','🌸','common',3,{observe:.24,wonder:.16,record:.12},['봄','길에','분홍깔림']),
  twoD('snowpatch','녹지 않은 눈','nature','❄️','uncommon',2,{observe:.24,wonder:.16},['그늘','겨울끝','조금남음']),
  twoD('mudprints','진흙 발자국','nature','👣','common',2,{observe:.22,wonder:.16,record:.10},['비온뒤','누가','줄지어']),
  twoD('feather','깃털','nature','🪶','common',2,{observe:.22,wonder:.18},['떨어짐','가벼움','누구것']),
  twoD('lostglove','떨어진 장갑','thing','🧤','common',2,{observe:.20,wonder:.16,record:.10},['한짝','난간위','주인은']),
  twoD('rainpuddle','빗물 고임','nature','💧','common',3,{observe:.20,wonder:.22,record:.12},['비침','하늘담김','첨벙'],['','하늘비친','작은']),
  twoD('frostgrass','서리 낀 풀','nature','❄️','uncommon',2,{observe:.26,wonder:.16},['아침','하얗게','바스락']),
  twoD('dryleaves','마른 잎 더미','nature','🍂','common',3,{observe:.20,rest:.10,record:.10},['가을','바스락','쌓임']),
  twoD('windblownpaper','날아온 종이','thing','📄','common',2,{observe:.18,wonder:.14},['바람','어디서','뒹굴']),
  twoD('brokenumbrella','망가진 우산','thing','☂️','common',2,{observe:.20,wonder:.14},['뒤집힘','버려짐','비바람뒤']),
  // ==== BUILD 409-C: 동물·곤충·새 25종 ====
  twoD('ladybug','무당벌레','animal','🐞','common',2,{observe:.26,wonder:.20,record:.12},['빨강','점박이','작다']),
  twoD('dragonfly','잠자리','animal','🦟','common',2,{observe:.24,wonder:.22},['여름','투명날개','앉았다감']),
  twoD('bee','벌','animal','🐝','common',2,{observe:.22,wonder:.18},['윙윙','꽃가','바쁨']),
  twoD('bumblebee','뒤영벌','animal','🐝','uncommon',1,{observe:.24,wonder:.20},['통통','느릿','털복숭이']),
  twoD('moth','나방','animal','🦋','common',2,{observe:.22,wonder:.16},['밤','가로등가','회색']),
  twoD('firefly','반딧불이','animal','✨','uncommon',1,{wonder:.32,observe:.20,record:.14},['여름밤','반짝','드묾']),
  twoD('grasshopper','메뚜기','animal','🦗','common',2,{observe:.24,wonder:.16},['풀숲','툭튐','초록']),
  twoD('cricket','귀뚜라미','animal','🦗','common',2,{observe:.22,rest:.12},['가을밤','소리','안보임']),
  twoD('anttrail','개미 행렬','animal','🐜','common',2,{observe:.28,wonder:.18,record:.10},['줄지어','바쁨','어디로']),
  twoD('frog','개구리','animal','🐸','common',2,{observe:.26,wonder:.18},['논가','개굴','비온뒤']),
  twoD('toad','두꺼비','animal','🐸','uncommon',1,{observe:.24,wonder:.16},['울퉁','느릿','밤길']),
  twoD('lizard','도마뱀','animal','🦎','uncommon',1,{observe:.26,wonder:.18},['돌위','재빠름','햇볕']),
  twoD('squirrel','다람쥐','animal','🐿️','uncommon',2,{observe:.28,wonder:.22,record:.14},['도토리','재빠름','나무']),
  twoD('hedgehog','고슴도치','animal','🦔','uncommon',1,{observe:.26,wonder:.20},['가시','웅크림','밤']),
  twoD('fieldmouse','들쥐','animal','🐭','common',2,{observe:.22,wonder:.16},['재빠름','풀숲','작다']),
  twoD('magpie','까치','animal','🐦','common',2,{observe:.24,wonder:.16,record:.10},['흑백','반가운','깍깍']),
  twoD('crow','까마귀','animal','🐦‍⬛','common',2,{observe:.22,wonder:.14},['검정','전깃줄','까악']),
  twoD('pigeon','비둘기','animal','🕊️','common',2,{observe:.20,rest:.10},['구구','회색','흔함']),
  twoD('swallow','제비','animal','🐦','uncommon',1,{observe:.26,wonder:.20,record:.12},['처마','봄','재빠른']),
  twoD('owl','부엉이','animal','🦉','uncommon',1,{observe:.28,wonder:.22},['밤','나뭇가지','조용']),
  twoD('duckling','아기 오리','animal','🐤','uncommon',1,{observe:.28,wonder:.24,record:.14},['삐약','줄지어','노랑']),
  twoD('chicken','닭','animal','🐔','common',2,{observe:.22,record:.10},['마당','꼬꼬','모이']),
  twoD('rooster','수탉','animal','🐓','uncommon',1,{observe:.24,wonder:.14},['볏','새벽','우렁참']),
  twoD('goat','염소','animal','🐐','uncommon',1,{observe:.24,rest:.14,wonder:.12},['매어둠','수염','풀뜯']),
  twoD('sheep','양','animal','🐑','uncommon',1,{observe:.24,rest:.16},['뭉게','하양','느긋']),
  // ==== BUILD 409-B: 생활 흔적과 시골 사물 25종 ====
  twoD('teakettle','주전자','thing','🫖','common',3,{observe:.22,rest:.12},['부엌밖','오래됨','손잡이'],['','양은','법랑']),
  twoD('enamelpot','양은냄비','thing','🍲','common',3,{observe:.20,record:.10},['찌그러짐','반짝','툇마루']),
  twoD('washbasin','대야','thing','🪣','common',3,{observe:.20,rest:.10},['엎어둠','빨간','마당']),
  twoD('clothespins','빨래집게','thing','🪀','common',3,{observe:.18,record:.10},['줄에','색색','몇개남음']),
  twoD('apron','앞치마','thing','🧵','common',2,{observe:.22,record:.12},['걸림','꽃무늬','일하다']),
  twoD('strawhat','밀짚모자','thing','👒','common',3,{observe:.24,rest:.12,wonder:.10},['벗어둠','햇살','밭일']),
  twoD('gloves','작업장갑','thing','🧤','common',3,{observe:.18},['흙묻음','한짝','벗어둠']),
  twoD('shovel','삽','thing','🛠️','common',3,{observe:.20,record:.10},['기대둠','흙','일중']),
  twoD('hoe','호미','thing','🛠️','common',3,{observe:.20},['텃밭','굽은날','손때']),
  twoD('rake','갈퀴','thing','🛠️','common',3,{observe:.20},['잎긁기','여러갈래','세워둠']),
  twoD('wheelbarrow','손수레','thing','🛒','uncommon',2,{observe:.24,record:.12},['세워둠','흙묻음','일끝']),
  twoD('fertilizerbag','비료 포대','thing','📦','common',2,{observe:.16},['쌓임','밭가','묵직']),
  twoD('ricebag','쌀자루','thing','🌾','uncommon',2,{observe:.18,record:.10},['가마니','묶음','창고앞']),
  twoD('flowerpot','화분','thing','🪴','common',4,{observe:.24,wonder:.12},['창가','흙','초록'],['','빈','꽃핀']),
  twoD('brokenpot','깨진 화분','thing','🪴','common',2,{observe:.22,wonder:.14},['조각','흙쏟김','버려짐']),
  twoD('wateringhose','물호스','thing','🚿','common',3,{observe:.16},['둘둘','초록','마당']),
  twoD('gardenbasket','바구니','thing','🧺','common',3,{observe:.20,record:.10},['비어있음','대나무','수확뒤']),
  twoD('woodsign','나무 표지판','thing','🪧','common',2,{observe:.20,record:.14},['글씨흐림','기울어짐','오래됨']),
  twoD('newspaper','신문','thing','📰','common',2,{observe:.18,record:.14},['접힘','바람에','어제것']),
  twoD('umbrella','우산','thing','☂️','common',3,{observe:.20,rest:.10},['세워둠','비올까','접힘'],['','파랑','검정']),
  twoD('raincoat','우비','thing','🧥','common',2,{observe:.18},['걸림','노랑','비온뒤']),
  twoD('thermos','보온병','thing','🍵','common',3,{observe:.18,rest:.12},['툇마루','따뜻','뚜껑컵']),
  twoD('radio','라디오','thing','📻','uncommon',2,{observe:.22,record:.14,rest:.10},['오래됨','안테나','소리날까']),
  twoD('stool','작은 의자','rest','🪑','common',3,{rest:.30,observe:.14},['플라스틱','낮은','마당']),
  twoD('doormat','현관 매트','rest','🚪','common',3,{rest:.20,observe:.14},['문앞','닳음','어서와']),
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

  /* ===== BUILD 414-B — 신규 100종 ===============================================
     registry가 단일 원본이다. CATALOG/RARE/PLAN은 미들웨어가 여기서 생성한다.
     각 항목은 index.html의 전용 drawProp 분기와 1:1 대응하며, 실루엣이 서로 겹치지
     않게 설계했다(색만 바꾼 복제 금지). 계절/시간/날씨 한정성은 label·jtags·
     spawnWeight로 표현한다.
     ---- batch 1 (001–025) ---- */
  // 일상·생활 (7)
  twoD('milkbox','우유 투입함','thing','🥛','common',3,{observe:.24,record:.10},['현관옆','작은문','오늘은비었다'],['','녹슨','스티커붙은']),
  twoD('gasmeter','가스 계량기','thing','🔢','common',3,{observe:.18,wonder:.10},['숫자가돈다','벽에붙어','아무도안본다']),
  twoD('watertap','수돗가','thing','🚰','common',3,{observe:.22,rest:.12},['물한방울','시멘트','손씻는곳'],['','물맺힌']),
  twoD('doorbell','초인종','thing','🔔','common',3,{observe:.20,wonder:.12},['눌러볼까','오래된','노란불']),
  twoD('shoerack','신발장','thing','👟','common',2,{observe:.24,record:.12},['문밖','짝맞춰','흙묻은']),
  twoD('trashbin','분리수거함','thing','🗑️','common',3,{observe:.16},['색깔별로','골목','가득']),
  twoD('parcelbox','택배 상자','thing','📦','common',3,{observe:.24,wonder:.14},['문앞','누가받을까','비맞는중'],['','젖은','뜯긴']),
  // 자연·식물·동물 흔적 (6)
  twoD('molehill','두더지 흙더미','nature','🕳️','uncommon',2,{observe:.30,wonder:.20},['밤사이','솟았다','아무도못봤다']),
  twoD('catprints','고양이 발자국','nature','🐾','uncommon',2,{observe:.32,wonder:.18,record:.14},['담장위','어디로갔을까','작다']),
  twoD('shellpile','달팽이 껍데기','nature','🐚','uncommon',2,{observe:.28,wonder:.16},['비어있다','바스락','여름끝']),
  twoD('brokeneggshell','깨진 알껍질','nature','🥚','rare',1,{observe:.30,wonder:.26,record:.16},['둥지아래','무사히갔길','조각']),
  twoD('gnawednut','갉아먹은 도토리','nature','🌰','uncommon',2,{observe:.26,wonder:.18},['이빨자국','누가먼저','가을것']),
  twoD('antmound','개미굴 입구','nature','🐜','common',3,{observe:.28,wonder:.14},['작은구멍','줄지어','바쁘다']),
  // 계절 한정 (4)
  twoD('cherryblossom','벚꽃 가지','nature','🌸','uncommon',3,{observe:.34,record:.22,wonder:.12},['봄이왔다','금방진다','올려다봄'],['','만개','지는중']),
  twoD('greenplum','풋매실','nature','🫒','uncommon',2,{observe:.26,wonder:.14},['초여름','시큼할것','단단하다']),
  twoD('persimmon','까치밥 감','nature','🍊','uncommon',2,{observe:.30,wonder:.20,record:.16},['늦가을','새몫으로','하나남김']),
  twoD('icicle','고드름','nature','🧊','uncommon',2,{observe:.30,wonder:.22,record:.14},['처마끝','겨울','투명하다'],['','긴','녹는중']),
  // 날씨 한정 (3)
  twoD('raindropleaf','빗방울 맺힌 잎','nature','💧','uncommon',2,{observe:.34,record:.20},['비온뒤','또르르','무거워보인다']),
  twoD('fogpost','안개 속 전봇대','thing','🌫️','uncommon',2,{wonder:.30,observe:.20},['흐릿하다','어디까지','조용']),
  twoD('windbentgrass','바람에 누운 풀','nature','🌾','common',3,{observe:.24,wonder:.14},['한쪽으로','바람방향','눕는다']),
  // 시간대 한정 (2)
  twoD('morningdew','새벽 이슬','nature','✨','uncommon',2,{observe:.32,record:.18},['해뜨기전','반짝','곧마른다']),
  twoD('nightwindow','밤에 켜진 창','thing','🪟','uncommon',2,{observe:.24,wonder:.26},['누가깨어있다','노란불','늦은시간']),
  // 상황형·조합형 (2)
  twoD('umbrellabike','우산 꽂힌 자전거','thing','☂️','rare',1,{observe:.30,wonder:.24,record:.18},['비올줄알았나','기대둠','주인은어디']),
  twoD('catonwall','담장 위 고양이','animal','🐈','rare',1,{observe:.36,record:.26,wonder:.16},['내려다본다','눈이마주쳤다','안도망간다']),
  // 이상하고 웃긴 것 (1)
  twoD('lonelyshoe','한 짝만 있는 신발','thing','👞','rare',1,{wonder:.34,observe:.22,record:.14},['왜한짝','나머지는','아무도안찾는다']),

  /* ---- batch 2 (026–050) ---- */
  // 일상·생활 (5)
  twoD('bottlecrate','빈 병 상자','thing','🍾','common',2,{observe:.22,record:.10},['가게앞','줄맞춰','햇빛통과']),
  twoD('firehydrant','소화전','thing','🧯','common',3,{observe:.20,wonder:.10},['빨갛다','한번도안쓴','골목모퉁이']),
  twoD('sandbag','모래 주머니','thing','🧱','uncommon',2,{observe:.18},['장마대비','쌓아둠','축축']),
  twoD('ricecooker','버려진 밥솥','thing','🍚','uncommon',1,{wonder:.26,observe:.20},['왜여기','뚜껑열림','은색']),
  twoD('sewingbox','반짇고리','rest','🧵','uncommon',1,{observe:.28,rest:.16,record:.12},['마루끝','실이삐져나옴','오래된']),
  // 자연·흔적 (5)
  twoD('wormcast','지렁이 흙','nature','🪱','common',3,{observe:.24,wonder:.14},['비온뒤','꼬불꼬불','살아있다']),
  twoD('birdpellet','새 먹이 흔적','nature','🪶','uncommon',2,{observe:.26,wonder:.20},['나무아래','부스러기','누가먹었나']),
  twoD('sapdrop','나무 진액','nature','🍯','uncommon',2,{observe:.30,wonder:.18,record:.12},['끈적','호박색','벌레가붙었다']),
  twoD('rootstep','드러난 뿌리','nature','🪵','common',3,{observe:.24,rest:.14},['길위로','걸려넘어질뻔','오래버팀']),
  twoD('mossstair','이끼 낀 계단','nature','🟩','uncommon',2,{observe:.28,rest:.12,record:.14},['미끄럽다','초록','그늘']),
  // 계절 (4)
  twoD('seedling-tray','모종판','nature','🌱','uncommon',2,{observe:.28,record:.14},['봄준비','줄맞춰','작다']),
  twoD('watermelon-rind','수박 껍질','thing','🍉','uncommon',1,{wonder:.24,observe:.18},['여름끝','누가먹었나','개미가먼저']),
  twoD('scarecrow','허수아비','thing','🎃','uncommon',2,{observe:.30,wonder:.24,record:.20},['가을논','새는안속는다','혼자서있다'],['','기울어진','옷벗겨진']),
  twoD('snowshovel','눈삽','thing','🧹','uncommon',2,{observe:.22,rest:.10},['현관옆','겨울아침','손잡이닳음']),
  // 날씨 (3)
  twoD('hailstone','우박 자국','nature','🧊','rare',1,{observe:.30,wonder:.28,record:.16},['잠깐쏟아짐','움푹','금방녹는다']),
  twoD('rainbowpuddle','기름 무지개 웅덩이','nature','🌈','rare',1,{observe:.34,wonder:.30,record:.22},['비온뒤','일곱색','더러운데예쁘다']),
  twoD('windvane','바람개비','thing','🎏','uncommon',2,{observe:.26,wonder:.22},['돌아간다','바람알림','색바램']),
  // 시간대 (3)
  twoD('longshadow','긴 그림자','nature','🌇','uncommon',2,{observe:.30,wonder:.20,record:.16},['해질녘','늘어난다','내것보다길다']),
  twoD('streetlight-on','막 켜진 가로등','thing','💡','uncommon',2,{observe:.24,wonder:.22},['저녁시작','깜빡','하나둘']),
  twoD('milkywayline','은하수 자락','rare','🌌','rare',0,{wonder:.55,observe:.30,record:.25},['불빛없는밤','흐릿한띠','오래봐야보인다'],[],{rareEvent:true}),
  // 상황형 (3)
  twoD('cat-in-box','상자 속 고양이','animal','📦','rare',1,{observe:.36,wonder:.26,record:.22},['딱맞는다','왜들어갔나','내다본다']),
  twoD('bike-basket-cat','자전거 바구니 고양이','animal','🚲','rare',1,{observe:.34,record:.28,wonder:.20},['자리주인','안내려온다','태워달라나']),
  twoD('laundry-rain','비 맞는 빨래','thing','👕','rare',1,{observe:.30,wonder:.26},['걷지못했다','주인은모른다','더젖는중']),
  // 이상하고 웃긴 것 (2)
  twoD('mannequin-arm','마네킹 팔','thing','💪','rare',1,{wonder:.38,observe:.24,record:.16},['왜여기','인사하는것같다','무섭진않다']),
  twoD('toy-in-drain','하수구에 빠진 장난감','thing','🧸','rare',1,{wonder:.34,observe:.26,record:.14},['못꺼낸다','눈만보인다','누가울었을까']),

  /* ---- batch 3 (051–075) ---- */
  // 일상·생활 (4)
  twoD('paint-bucket','페인트 통','thing','🎨','common',2,{observe:.22,wonder:.12},['공사중','흘러굳음','뚜껑없다']),
  twoD('ladder-lean','기대둔 사다리','thing','🪜','uncommon',2,{observe:.24,wonder:.14},['벽에','올라갈일있었나','접힌채']),
  twoD('kimchi-pot','장독대','rest','🏺','uncommon',2,{observe:.28,rest:.14,record:.16},['볕좋은날','뚜껑닫힘','묵직하다'],['','줄지어','눈덮인']),
  twoD('bus-bench','버스 정류장 의자','rest','🚏','common',3,{rest:.36,observe:.18},['아무도없다','기다림','시간표빛바램']),
  // 자연·흔적 (4)
  twoD('anthill-crack','보도블록 틈 풀','nature','🌿','common',3,{observe:.30,wonder:.18},['시멘트뚫고','끈질기다','작다']),
  twoD('bark-peel','벗겨진 나무껍질','nature','🪵','uncommon',2,{observe:.26,record:.12},['속살보임','시간','만지면부서짐']),
  twoD('crushed-leaf','밟힌 낙엽','nature','🍂','common',3,{observe:.22,wonder:.12},['바스러짐','누가먼저','소리났다']),
  twoD('bird-shadow','새 그림자','nature','🕊️','rare',1,{observe:.32,wonder:.30,record:.18},['위를봤다','벌써없다','스쳐감']),
  // 계절 (4)
  twoD('tadpole-pool','올챙이 웅덩이','animal','🐸','uncommon',2,{observe:.34,wonder:.24,record:.16},['봄논','꼬물꼬물','금방개구리']),
  twoD('cicada-shell','매미 허물','nature','🪰','uncommon',2,{observe:.32,wonder:.26,record:.18},['한여름','비어있다','붙어있다']),
  twoD('drying-chili','고추 말리기','thing','🌶️','uncommon',2,{observe:.28,record:.18},['가을볕','빨갛다','마당가득']),
  twoD('frozen-laundry','언 빨래','thing','🧊','rare',1,{wonder:.30,observe:.26,record:.14},['뻣뻣하다','한겨울','세워진다']),
  // 날씨 (2)
  twoD('mud-splash','흙탕물 튄 자국','nature','💦','common',3,{observe:.20,wonder:.12},['차지나감','벽에','비온날']),
  twoD('snow-footprint','눈 위 발자국','nature','👣','uncommon',2,{observe:.32,wonder:.20,record:.16},['누가먼저지나감','한줄','곧덮인다']),
  // 시간대 (3)
  twoD('sunrise-mist','해뜰녘 물안개','nature','🌅','rare',1,{observe:.32,wonder:.30,record:.20},['논위로','피어오름','금방걷힌다']),
  twoD('noon-shade','정오의 그늘','rest','☂️','common',3,{rest:.34,observe:.16},['딱한뼘','여기만시원','나무아래']),
  twoD('moth-lamp','가로등 나방','animal','🦋','uncommon',2,{observe:.28,wonder:.24},['불빛에','계속부딪힌다','밤에만']),
  // 상황형 (3)
  twoD('sparrow-on-wire','전깃줄 참새떼','animal','🐦','uncommon',2,{observe:.32,record:.24,wonder:.16},['줄맞춰','한칸씩','동시에난다']),
  twoD('dog-waiting','기다리는 개','animal','🐕','rare',1,{observe:.36,wonder:.26,record:.22},['가게앞','주인기다림','움직이지않는다']),
  twoD('cat-fight-stare','마주친 고양이 둘','animal','😾','rare',1,{observe:.34,wonder:.28},['서로안비킴','정지','긴장']),
  // 이상하고 웃긴 것 (3)
  twoD('shoe-on-pole','전봇대 위 신발','thing','👟','rare',1,{wonder:.40,observe:.24},['어떻게올라갔나','아무도모른다','오래됨']),
  twoD('face-stain','얼굴처럼 보이는 얼룩','thing','😶','rare',1,{wonder:.38,observe:.28,record:.16},['보인다','한번보면','벽이웃는다']),
  twoD('overgrown-car','풀에 덮인 차','thing','🚗','rare',1,{wonder:.34,observe:.30,record:.20},['몇년됐을까','타이어없음','풀이이겼다']),
  // 극희귀 (2)
  twoD('doublerainbow','쌍무지개','rare','🌈','rare',0,{wonder:.6,observe:.35,record:.35},['두개다','평생몇번','말이안나온다'],[],{rareEvent:true}),
  twoD('white-sparrow','흰 참새','rare','🐦','rare',0,{wonder:.6,observe:.4,record:.35},['처음본다','정말흰색','아무도안믿을것'],[],{rareEvent:true}),

  /* ---- batch 4 (076–100) ---- */
  // 일상·생활 (4)
  twoD('roof-tile','떨어진 기와','thing','🧱','uncommon',2,{observe:.24,record:.12},['바람불던밤','깨졌다','올려다봄']),
  twoD('name-plate','문패','thing','🪧','common',3,{observe:.26,wonder:.14,record:.12},['성씨','오래됨','누가살까'],['','한자','지워진']),
  twoD('coal-briquette','연탄','thing','⚫','uncommon',2,{observe:.24,wonder:.16},['구멍스물두개','다탔다','겨울흔적']),
  twoD('bell-bicycle','자전거 종','thing','🔔','common',2,{observe:.22,wonder:.14},['녹슬었다','울릴까','손잡이끝']),
  // 자연·흔적 (5)
  twoD('crab-hole','게 구멍','nature','🦀','uncommon',2,{observe:.30,wonder:.24},['갯가','작은흙공','숨었다']),
  twoD('bee-hive-small','작은 벌집','nature','🍯','rare',1,{observe:.30,wonder:.28,record:.16},['처마밑','조심','윙윙']),
  twoD('bamboo-shoot','죽순','nature','🎋','uncommon',2,{observe:.30,wonder:.20,record:.14},['하루가다르다','뾰족','땅뚫음']),
  twoD('lichen-rock','지의류 바위','nature','🪨','common',3,{observe:.28,wonder:.16},['얼룩덜룩','아주느리게','오래됨']),
  twoD('bird-bath','새 물웅덩이','nature','🐦','uncommon',2,{observe:.30,record:.18},['목욕중','파닥','금방간다']),
  // 계절 (3)
  twoD('acorn-cap','도토리 깍정이','nature','🌰','common',3,{observe:.24,wonder:.16},['모자만','알맹이는','가을바닥']),
  twoD('snow-branch','눈 얹힌 가지','nature','❄️','uncommon',2,{observe:.32,record:.20},['소복','휘었다','건드리면진다']),
  twoD('spring-puddle-sky','하늘 비친 웅덩이','nature','☁️','uncommon',2,{observe:.34,wonder:.26,record:.22},['거꾸로','밟기아깝다','구름이발밑에']),
  // 날씨 (2)
  twoD('frost-window','성에 낀 유리','thing','🧊','uncommon',2,{observe:.32,wonder:.24,record:.16},['그림같다','손대면녹음','아침에만']),
  twoD('dust-devil','흙먼지 회오리','nature','🌪️','rare',1,{wonder:.36,observe:.26},['잠깐돌다','사라짐','작은회오리']),
  // 시간대 (2)
  twoD('lunch-smoke','점심 연기','thing','💨','uncommon',2,{observe:.26,wonder:.22},['굴뚝에서','밥때','냄새도난다']),
  twoD('evening-crow','저녁 까마귀','animal','🐦‍⬛','uncommon',2,{observe:.28,wonder:.22},['집에간다','시끄럽다','줄지어']),
  // 상황형 (2)
  twoD('cat-sunbeam','볕에 누운 고양이','animal','🐈','rare',1,{observe:.36,rest:.28,record:.24},['딱그자리','안움직인다','부럽다']),
  twoD('umbrella-forgotten','두고 간 우산','thing','☂️','rare',1,{observe:.28,wonder:.26},['비는그쳤다','주인은잊었다','벽에기댐']),
  // 이상하고 웃긴 것 (4)
  twoD('cat-loaf','식빵 굽는 고양이','animal','🍞','rare',1,{observe:.34,wonder:.28,record:.20},['발이없다','완벽한네모','건드리면풀림']),
  twoD('sign-typo','오타 난 간판','thing','🔤','rare',1,{wonder:.40,observe:.26,record:.18},['한글자틀림','아무도안고침','정겹다']),
  twoD('scarecrow-hat-bird','허수아비 모자 위 새','animal','🐦','rare',1,{wonder:.42,observe:.30,record:.24},['효과없다','당당하다','앉을자리']),
  twoD('boot-planter','장화 화분','thing','🥾','rare',1,{wonder:.34,observe:.26,record:.16},['신발이었던것','꽃이산다','재활용']),
  // 극희귀 (3)
  twoD('fox-glimpse','스쳐간 여우','rare','🦊','rare',0,{wonder:.6,observe:.4,record:.3},['정말여우였나','한순간','눈이마주쳤다'],[],{rareEvent:true}),
  twoD('halo-sun','햇무리','rare','☀️','rare',0,{wonder:.55,observe:.35,record:.3},['해주위고리','눈부시다','날씨바뀔징조'],[],{rareEvent:true}),
  twoD('paper-boat','떠내려온 종이배','rare','🛶','rare',0,{wonder:.5,observe:.35,record:.35},['누가접었을까','아직안젖음','어디서왔나'],[],{rareEvent:true}),

  /* ===== BUILD 414-C — 오브젝트 101–200 =========================================
     ---- batch 1 (101–125) ---- */
  // 일상·생활 (5)
  twoD('rice-scoop','쌀 됫박','thing','🍚','uncommon',2,{observe:.24,record:.12},['광에','나무결','손때묻음']),
  twoD('coal-tongs','부지깽이','thing','🔥','uncommon',2,{observe:.22,wonder:.12},['아궁이옆','끝이검다','겨울내내']),
  twoD('water-jar','물동이','rest','🫗','uncommon',2,{observe:.26,rest:.12},['이고날랐다','금이갔다','이제안쓴다']),
  twoD('straw-rope','새끼줄','thing','🪢','common',3,{observe:.22,wonder:.14},['꼬였다','문앞','뭘막으려했나']),
  twoD('tin-roof-patch','양철 덧댄 자국','thing','🔩','common',3,{observe:.20,wonder:.12},['비새던곳','임시로','오래버팀']),
  // 자연·흔적 (5)
  twoD('deer-track','고라니 발자국','nature','🦌','rare',1,{observe:.32,wonder:.28,record:.16},['밭까지내려왔다','두갈래','새벽에']),
  twoD('owl-pellet','올빼미 뭉치','nature','🦉','rare',1,{observe:.30,wonder:.30},['뼈가보인다','나무밑','밤의흔적']),
  twoD('fallen-nest','떨어진 둥지','nature','🪹','rare',1,{observe:.32,wonder:.26,record:.18},['비었다','바람불던밤','잘지었는데']),
  twoD('woodpecker-hole','딱따구리 구멍','nature','🪵','uncommon',2,{observe:.30,wonder:.22},['동그랗다','줄지어','안에누가']),
  twoD('spider-dew','이슬 맺힌 거미줄','nature','🕸️','uncommon',2,{observe:.34,record:.22,wonder:.14},['새벽에만보인다','기하학','건드리기아깝다']),
  // 계절 (4)
  twoD('barley-field','청보리','nature','🌾','uncommon',2,{observe:.30,record:.18},['봄끝','물결친다','파랗다']),
  twoD('ice-pop-stick','아이스크림 막대','thing','🍦','common',3,{observe:.20,wonder:.14},['여름','누가먹고버림','당첨아님']),
  twoD('rice-sheaf','볏단','nature','🌾','uncommon',2,{observe:.26,rest:.14,record:.14},['추수끝','세워둠','고소한냄새']),
  twoD('brazier','화로','rest','🔥','uncommon',2,{rest:.32,observe:.20,wonder:.14},['손쬐던곳','재만','겨울밤']),
  // 날씨 (3)
  twoD('wet-cement-print','굳은 시멘트 발자국','thing','👣','uncommon',2,{observe:.28,wonder:.24,record:.16},['그때는몰랐겠지','영원히','작은발']),
  twoD('lightning-tree','벼락 맞은 나무','nature','⚡','rare',1,{wonder:.36,observe:.30,record:.20},['갈라졌다','그날밤','아직서있다']),
  twoD('drizzle-web','가랑비 젖은 거미줄','nature','🌦️','uncommon',2,{observe:.30,record:.18},['무거워보인다','실처럼','조용한비']),
  // 시간대 (3)
  twoD('dawn-rooster','새벽 닭','animal','🐓','uncommon',2,{observe:.26,wonder:.20},['벌써운다','아직어둡다','정확하다']),
  twoD('lunch-bell','점심 종','thing','🔔','uncommon',2,{observe:.22,wonder:.18},['마을에울림','밥때','멀리서']),
  twoD('night-radio','밤 라디오 불빛','thing','📻','uncommon',2,{observe:.24,wonder:.26,rest:.14},['주파수맞춤','작게','누가듣나']),
  // 상황형 (2)
  twoD('cat-under-car','차 밑 고양이','animal','🐈','rare',1,{observe:.34,wonder:.26},['눈만보인다','안나온다','여기가안전']),
  twoD('bird-on-scarecrow-arm','허수아비 팔의 새','animal','🐦','rare',1,{observe:.32,wonder:.28,record:.20},['쉬는중','효과없음','당연하다는듯']),
  // 이상하고 웃긴 것 (2)
  twoD('upside-down-pot','거꾸로 엎은 화분','thing','🪴','rare',1,{wonder:.34,observe:.24},['왜뒤집혔나','밟고올라섰나','흙은어디']),
  twoD('tv-in-field','밭 가운데 TV','thing','📺','rare',1,{wonder:.40,observe:.28,record:.18},['채널이없다','왜여기','풀이자란다']),
  // 극희귀 (1)
  twoD('deer-eyes','마주친 고라니','rare','🦌','rare',0,{wonder:.6,observe:.4,record:.3},['둘다멈췄다','먼저갔다','심장이뛰었다'],[],{rareEvent:true}),

  /* ---- batch 2 (126–150) ---- */
  // 일상·생활 (5)
  twoD('gourd-dipper','바가지','thing','🥄','uncommon',2,{observe:.24,wonder:.12},['우물가','반쪽','물맛']),
  twoD('millstone','맷돌','rest','⚙️','uncommon',2,{observe:.28,rest:.14,record:.14},['이제안돈다','무겁다','손잡이만남음']),
  twoD('sieve','체','thing','🕸️','common',3,{observe:.22},['걸러내던것','구멍촘촘','벽에걸림']),
  twoD('oil-lamp','호롱불','rest','🪔','uncommon',2,{observe:.26,wonder:.24,rest:.12},['심지','그을음','전기전에']),
  twoD('chamber-pot','요강','thing','🫙','rare',1,{wonder:.30,observe:.20},['말안해도안다','구석에','뚜껑덮임']),
  // 자연·흔적 (5)
  twoD('boar-dig','멧돼지 판 자국','nature','🐗','rare',1,{observe:.30,wonder:.30},['밭이엉망','밤사이','또왔다']),
  twoD('snake-skin','뱀 허물','nature','🐍','rare',1,{observe:.32,wonder:.32,record:.18},['통째로','바스락','주인은어디']),
  twoD('fish-bone','물가 생선뼈','nature','🐟','uncommon',2,{observe:.26,wonder:.20},['누가먹었나','깨끗하다','고양이일것']),
  twoD('crow-cache','까마귀 숨긴 것','nature','🥜','rare',1,{observe:.30,wonder:.30,record:.16},['묻어뒀다','기억할까','반짝이는것']),
  twoD('hoofprint-mud','진흙 발굽 자국','nature','🐄','uncommon',2,{observe:.26,wonder:.16},['소가지나감','깊다','물고임']),
  // 계절 (4)
  twoD('frog-egg','개구리 알','animal','🥚','uncommon',2,{observe:.32,wonder:.26,record:.14},['젤리같다','논가','봄시작']),
  twoD('sun-shower','여우비','nature','🌦️','rare',1,{wonder:.36,observe:.28,record:.20},['해나는데비','금방그친다','여우시집간다']),
  twoD('chestnut-burr','밤송이','nature','🌰','uncommon',2,{observe:.28,wonder:.18},['가시투성이','벌어졌다','발로까야']),
  twoD('frost-flower','서리꽃','nature','❄️','uncommon',2,{observe:.34,record:.22,wonder:.16},['풀끝마다','아침에만','밟으면사라짐']),
  // 날씨 (2)
  twoD('rain-gutter-flow','빗물 홈통','thing','🌧️','uncommon',2,{observe:.26,wonder:.16},['콸콸','한곳으로','소리가좋다']),
  twoD('snow-drift','눈 쌓인 담','nature','⛄','uncommon',2,{observe:.28,record:.16},['한쪽만','바람이만듦','부드럽다']),
  // 시간대 (2)
  twoD('dusk-bat','저녁 박쥐','animal','🦇','rare',1,{observe:.30,wonder:.32},['불규칙하게','벌써나왔다','소리는안들림']),
  twoD('midnight-frost','한밤 서리','nature','🌙','uncommon',2,{observe:.28,wonder:.22},['아무도안봄','조용히내림','달빛에반짝']),
  // 상황형 (3)
  twoD('cat-vs-bird','고양이와 새','animal','🐈','rare',1,{observe:.36,wonder:.28,record:.22},['둘다멈춤','새가더여유','기회를노림']),
  twoD('dog-in-puddle','웅덩이 밟은 개','animal','🐕','rare',1,{observe:.32,wonder:.26,record:.20},['일부러','신났다','주인표정']),
  twoD('umbrella-two','우산 하나 둘이서','thing','☂️','rare',1,{observe:.30,wonder:.30,record:.24},['한쪽어깨젖음','천천히간다','말이없다']),
  // 이상하고 웃긴 것 (3)
  twoD('sock-on-fence','울타리 위 양말','thing','🧦','rare',1,{wonder:.36,observe:.22},['빨래에서날아옴','한짝','아무도안찾음']),
  twoD('cat-in-sink','싱크대 속 고양이','animal','🚰','rare',1,{wonder:.36,observe:.30,record:.20},['왜하필','물틀면','안비킨다']),
  twoD('bike-with-plant','풀 자란 자전거','thing','🚲','rare',1,{wonder:.34,observe:.28,record:.18},['몇년세워둠','바퀴사이로','이제못탄다']),
  // 극희귀 (1)
  twoD('fireball-meteor','대낮 불덩이','rare','☄️','rare',0,{wonder:.65,observe:.4,record:.35},['낮에봤다','소리도났다','아무도안믿는다'],[],{rareEvent:true}),

  /* ---- batch 3 (151–175) ---- */
  // 일상·생활 (5)
  twoD('bellows','풀무','thing','💨','uncommon',2,{observe:.24,wonder:.14},['불피우던것','가죽갈라짐','아직바람나온다']),
  twoD('rice-chest','뒤주','rest','🌾','uncommon',2,{observe:.26,rest:.12,record:.12},['비었다','자물쇠','귀했던시절']),
  twoD('ink-stone','벼루','rest','🖋️','rare',1,{observe:.30,rest:.14,record:.18},['먹이말랐다','서랍깊이','누가썼을까']),
  twoD('wooden-comb','나무 빗','thing','💇','uncommon',2,{observe:.26,record:.14},['이가빠짐','머리카락하나','창턱']),
  twoD('button-tin','단추 깡통','thing','🔘','uncommon',2,{observe:.28,wonder:.16},['짤랑','다다른모양','언젠가쓸것']),
  // 자연·흔적 (5)
  twoD('rabbit-pellets','토끼 흔적','nature','🐇','uncommon',2,{observe:.26,wonder:.20},['동글동글','풀밭','밤손님']),
  twoD('bee-on-clover','토끼풀의 벌','animal','🐝','uncommon',2,{observe:.32,record:.20,wonder:.14},['바쁘다','꽃마다','잠깐']),
  twoD('half-eaten-fruit','반쯤 먹힌 과일','nature','🍎','uncommon',2,{observe:.28,wonder:.22},['새가먼저','달았나보다','아깝다']),
  twoD('tree-scar','나무의 상처','nature','🪵','uncommon',2,{observe:.28,wonder:.20,record:.14},['오래전','아물었다','흉터도나이테']),
  twoD('salamander','도롱뇽','animal','🦎','rare',1,{observe:.34,wonder:.30,record:.18},['계곡','안움직인다','물이맑다는뜻']),
  // 계절 (3)
  twoD('mugwort','쑥','nature','🌿','uncommon',2,{observe:.28,record:.14},['봄','뜯어가는사람','냄새로안다']),
  twoD('corn-drying','매달린 옥수수','thing','🌽','uncommon',2,{observe:.26,record:.16},['처마밑','줄줄이','씨앗용']),
  twoD('cabbage-frost','서리 맞은 배추','nature','🥬','uncommon',2,{observe:.28,wonder:.18},['더달아진다','겨울밭','김장전']),
  // 날씨 (3)
  twoD('puddle-ice','살얼음 웅덩이','nature','🧊','uncommon',2,{observe:.30,wonder:.24,record:.14},['밟으면깨진다','유혹','첫추위']),
  twoD('wind-dust','흙바람','nature','🌬️','uncommon',2,{observe:.22,wonder:.18},['눈이따갑다','봄','앞이흐리다']),
  twoD('rain-on-tin','양철지붕 비','thing','🌧️','uncommon',2,{observe:.24,wonder:.22,rest:.16},['소리가크다','잠이온다','한참듣는다']),
  // 시간대 (2)
  twoD('morning-shadow-long','아침 긴 그림자','nature','🌄','uncommon',2,{observe:.28,wonder:.20,record:.16},['서쪽으로','키가커졌다','해가낮다']),
  twoD('dusk-swallow','저녁 제비떼','animal','🐦','uncommon',2,{observe:.30,record:.22,wonder:.18},['낮게난다','비올징조','빠르다']),
  // 상황형 (3)
  twoD('cat-following','따라오는 고양이','animal','🐈','rare',1,{observe:.36,wonder:.30,record:.22},['거리를둔다','멈추면멈춘다','밥달라나']),
  twoD('bird-vs-scarecrow','허수아비 쪼는 새','animal','🐦','rare',1,{wonder:.38,observe:.30,record:.20},['무서워하지않음','오히려','짚을뽑는다']),
  twoD('dog-and-cat-nap','같이 자는 개와 고양이','animal','🐕','rare',1,{observe:.38,rest:.30,record:.26},['원수아니었나','볕이좋으면','상관없나보다']),
  // 이상하고 웃긴 것 (3)
  twoD('boot-on-post','말뚝 위 장화','thing','🥾','rare',1,{wonder:.36,observe:.22},['거꾸로꽂힘','왜','비피하라고']),
  twoD('doll-in-window','창가 인형','thing','🧸','rare',1,{wonder:.40,observe:.28},['계속본다','눈이','밤엔안본다']),
  twoD('fridge-outside','밖에 둔 냉장고','thing','🧊','rare',1,{wonder:.36,observe:.28,record:.16},['마당에','아직돈다','왜밖에']),
  // 극희귀 (1)
  twoD('albino-deer','흰 고라니','rare','🦌','rare',0,{wonder:.65,observe:.4,record:.35},['하얗다','전설같다','한번뿐일것'],[],{rareEvent:true}),

  /* ---- batch 4 (176–200) ---- */
  // 일상·생활 (5)
  twoD('bamboo-basket','대바구니','thing','🧺','uncommon',2,{observe:.26,record:.12},['성글게짰다','나물담던','손잡이닳음']),
  twoD('yard-broom','마당비','thing','🧹','common',3,{observe:.22},['싸리로만듦','벽에','자국이남는다']),
  twoD('lantern-post','등불 기둥','thing','🏮','uncommon',2,{observe:.26,wonder:.22},['골목입구','붉다','바람에흔들']),
  twoD('grinding-bowl','절구','rest','🥣','uncommon',2,{observe:.26,rest:.12},['돌로판','공이는어디','고춧가루자국']),
  twoD('window-lattice','창살','thing','🪟','common',3,{observe:.24,wonder:.14},['격자','한지','안이안보인다']),
  // 자연·흔적 (5)
  twoD('cat-scratch-tree','고양이 발톱 자국','nature','🪵','uncommon',2,{observe:.28,wonder:.20},['세로로','영역표시','높이가낮다']),
  twoD('bird-feather-pile','흩어진 깃털','nature','🪶','rare',1,{observe:.30,wonder:.28},['무슨일이','여러개','말하지않는다']),
  twoD('mushroom-cluster','그루터기 버섯','nature','🍄','uncommon',2,{observe:.32,record:.18,wonder:.16},['비온뒤','하룻밤새','먹으면안될것']),
  twoD('root-bridge','뿌리 다리','nature','🌳','rare',1,{observe:.30,wonder:.26,record:.18},['개울위로','저절로','건널수있다']),
  twoD('bug-hole-leaf','구멍 난 잎','nature','🍃','common',3,{observe:.26,wonder:.14},['누가먹었나','레이스같다','햇빛통과']),
  // 계절 (4)
  twoD('willow-catkin','버들강아지','nature','🌿','uncommon',2,{observe:.30,record:.18},['보송보송','봄먼저','만지고싶다']),
  twoD('sunflower-heavy','고개숙인 해바라기','nature','🌻','uncommon',2,{observe:.30,wonder:.20,record:.18},['씨가찼다','무거워서','여름끝']),
  twoD('ginkgo-fall','은행잎 카펫','nature','🍂','uncommon',2,{observe:.32,record:.22},['노랗다','냄새는','밟기아깝다']),
  twoD('snow-tunnel','눈 치운 길','nature','⛄','uncommon',2,{observe:.28,wonder:.18},['양옆이벽','누가치웠나','좁다']),
  // 날씨 (2)
  twoD('cloud-shadow','구름 그림자','nature','☁️','uncommon',2,{observe:.28,wonder:.24},['땅위를지나간다','잠깐어둡다','따라가고싶다']),
  twoD('after-rain-steam','비 갠 뒤 김','nature','♨️','uncommon',2,{observe:.28,wonder:.22,record:.14},['아스팔트에서','올라온다','여름소나기']),
  // 시간대 (3)
  twoD('first-light','첫 빛','nature','🌅','rare',1,{observe:.32,wonder:.30,record:.22},['산등성이','하루가시작','조용하다']),
  twoD('noon-cicada','한낮 매미소리','animal','🪰','uncommon',2,{observe:.26,wonder:.20},['시끄럽다','어디있나','더워진다']),
  twoD('lamp-moth-swarm','밤 가로등 벌레떼','animal','🦟','uncommon',2,{observe:.24,wonder:.24},['빙빙','불빛만보면','수십마리']),
  // 상황형 (2)
  twoD('cat-watching-rain','비 보는 고양이','animal','🐈','rare',1,{observe:.36,rest:.24,wonder:.24},['처마밑','안나간다','같이본다']),
  twoD('bird-drinking','물 마시는 새','animal','🐦','rare',1,{observe:.34,record:.24,wonder:.16},['고개들었다','목넘김','조심스럽다']),
  // 이상하고 웃긴 것 (2)
  twoD('cat-in-hat','모자 쓴 고양이','animal','🎩','rare',1,{wonder:.42,observe:.30,record:.24},['누가씌웠나','벗지도않는다','당당하다']),
  twoD('sign-fell','넘어진 표지판','thing','🪧','rare',1,{wonder:.32,observe:.24},['방향을잃음','아무도안세움','땅을가리킨다']),
  // 극희귀 (2)
  twoD('aurora-faint','희미한 오로라','rare','🌌','rare',0,{wonder:.7,observe:.4,record:.35},['여기서보일리없는데','초록빛','착각일까'],[],{rareEvent:true}),
  twoD('twin-moon','달무리 진 달','rare','🌕','rare',0,{wonder:.6,observe:.4,record:.3},['고리가둘렀다','내일비올것','오래봤다'],[],{rareEvent:true}),

  /* ===== BUILD 414-D — 오브젝트 201–300 =========================================
     ---- batch 1 (201–225) ---- */
  // 일상·생활 (5)
  twoD('kettle-stand','주전자 받침','thing','🫖','common',3,{observe:.22},['까맣게그을림','툇마루','자국이남음']),
  twoD('shoe-brush','구둣솔','thing','🖌️','common',3,{observe:.20,record:.10},['털이닳음','현관구석','오래안씀']),
  twoD('coat-hook','벽 옷걸이','thing','🪝','common',3,{observe:.22,wonder:.12},['하나만','못자국','아무것도안걸림']),
  twoD('rice-paper-door','문풍지','thing','🚪','uncommon',2,{observe:.26,wonder:.16},['찢어진곳','바람소리','손가락자국']),
  twoD('meter-box','계량기함','thing','📦','common',3,{observe:.18},['녹슨문','반쯤열림','거미줄']),
  // 자연·흔적 (5)
  twoD('pinecone-open','벌어진 솔방울','nature','🌲','common',3,{observe:.26,wonder:.16},['마른날','씨는날아감','비늘같다']),
  twoD('bird-dropping-rock','새 앉던 자리','nature','🪨','uncommon',2,{observe:.24,wonder:.18},['같은자리','흰자국','늘여기']),
  twoD('leaf-skeleton','잎맥만 남은 잎','nature','🍃','rare',1,{observe:.34,wonder:.28,record:.20},['살은사라짐','레이스','들면비친다']),
  twoD('turtle-slow','느린 거북','animal','🐢','rare',1,{observe:.34,wonder:.30,record:.18},['개울가','안서두른다','목을뺐다']),
  twoD('beetle-log','통나무 속 벌레','animal','🪲','uncommon',2,{observe:.30,wonder:.22},['들추면','바글','미안해진다']),
  // 계절 (4)
  twoD('spring-onion-bed','봄 파밭','nature','🧅','uncommon',2,{observe:.26,record:.14},['줄맞춰','매운냄새','뽑기전']),
  twoD('watering-summer','한여름 물주기','thing','💦','uncommon',2,{observe:.26,wonder:.16},['해질때','흙냄새','증발한다']),
  twoD('pepper-string','고추 두름','thing','🌶️','uncommon',2,{observe:.28,record:.16},['처마에','붉은줄','가을']),
  twoD('straw-mat-snow','눈 덮인 멍석','thing','⛄','uncommon',2,{observe:.24,wonder:.16},['걷지못함','겨울내내','속은마름']),
  // 날씨 (3)
  twoD('wind-chime-storm','폭풍의 풍경','thing','🎐','rare',1,{wonder:.32,observe:.24},['너무크게운다','불안하다','창닫아야']),
  twoD('fog-lamp','안개 속 등불','thing','🔦','uncommon',2,{wonder:.32,observe:.24},['번져보인다','가까운데멀다','노랗다']),
  twoD('sleet-street','진눈깨비 길','nature','🌨️','uncommon',2,{observe:.24,wonder:.18},['질척','비도눈도아님','미끄럽다']),
  // 시간대 (2)
  twoD('breakfast-steam','아침 밥상 김','thing','🍚','uncommon',2,{observe:.26,rest:.16,wonder:.14},['모락','창에서린다','따뜻할것']),
  twoD('night-guard-light','야경 손전등','thing','🔦','rare',1,{observe:.24,wonder:.28},['멀리서','왔다갔다','누가지킨다']),
  // 상황형 (3)
  twoD('cat-on-warm-hood','보닛 위 고양이','animal','🚗','rare',1,{observe:.36,rest:.26,record:.22},['아직따뜻하다','자리잡음','주인이난감']),
  twoD('bird-nest-lamp','가로등 둥지','animal','🪹','rare',1,{observe:.32,wonder:.30,record:.20},['밝은데','괜찮을까','매년같은자리']),
  twoD('dog-with-stick','막대 문 개','animal','🦴','rare',1,{observe:.32,wonder:.24,record:.20},['자기몸만하다','안놓는다','자랑하는듯']),
  // 이상하고 웃긴 것 (2)
  twoD('chair-on-roof','지붕 위 의자','thing','🪑','rare',1,{wonder:.40,observe:.26},['어떻게올렸나','누가앉나','내려다보려고']),
  twoD('shoes-lined-up','줄 세운 신발들','thing','👟','rare',1,{wonder:.34,observe:.26,record:.16},['크기순','누가정리했나','완벽하다']),
  // 극희귀 (1)
  twoD('flying-squirrel','날다람쥐','rare','🐿️','rare',0,{wonder:.65,observe:.4,record:.35},['정말날았다','밤에만','눈이컸다'],[],{rareEvent:true}),

  /* ---- batch 2 (226–250) ---- */
  // 일상·생활 (5)
  twoD('salt-jar','소금 단지','thing','🧂','uncommon',2,{observe:.24,wonder:.12},['부엌뒤','굵은소금','습기먹음']),
  twoD('fly-swatter','파리채','thing','🪰','common',3,{observe:.20,wonder:.12},['벽에걸림','여름내내','구멍뚫림']),
  twoD('thread-spool','실패','thing','🧵','common',3,{observe:.24,record:.12},['거의다썼다','색이바램','굴러다님']),
  twoD('kettle-whistle','휘파람 주전자','thing','🫖','uncommon',2,{observe:.26,wonder:.16},['울린다','아무도안온다','물이졸는중']),
  twoD('bucket-well','두레박','thing','🪣','uncommon',2,{observe:.26,wonder:.18},['줄이길다','바닥이깊다','이제안쓴다']),
  // 자연·흔적 (5)
  twoD('bamboo-fallen','쓰러진 대나무','nature','🎋','uncommon',2,{observe:.26,wonder:.16},['눈무게에','쪼개짐','속이비었다']),
  twoD('cobweb-corner','구석 거미줄','nature','🕸️','common',3,{observe:.24,wonder:.16},['먼지붙음','오래됨','주인은없다']),
  twoD('mole-tunnel','두더지 길','nature','🕳️','uncommon',2,{observe:.28,wonder:.22},['땅이봉긋','줄지어','밭을가로질러']),
  twoD('bird-bone','작은 뼈','nature','🦴','rare',1,{observe:.28,wonder:.30},['가볍다','속이비었다','날았던것']),
  twoD('ant-carry','뭘 나르는 개미','animal','🐜','uncommon',2,{observe:.32,wonder:.24,record:.14},['자기보다크다','포기안한다','한참봤다']),
  // 계절 (4)
  twoD('seed-packet','씨앗 봉지','thing','🌱','uncommon',2,{observe:.26,record:.14},['봄','그림이예쁨','반쯤남음']),
  twoD('fan-old','부채','rest','🪭','uncommon',2,{rest:.28,observe:.18},['대나무살','여름','손목이아프다']),
  twoD('acorn-basket','도토리 바구니','thing','🌰','uncommon',2,{observe:.26,record:.14},['한가득','누가주웠나','묵쑤려나']),
  twoD('kotatsu-blanket','화롯불 이불','rest','🔥','rare',1,{rest:.36,observe:.20,wonder:.14},['발만넣고','나오기싫다','겨울']),
  // 날씨 (2)
  twoD('umbrella-inside-out','뒤집힌 우산','thing','☂️','uncommon',2,{wonder:.30,observe:.22},['바람에졌다','못쓴다','버려짐']),
  twoD('rain-window-drop','창의 빗줄기','thing','🌧️','uncommon',2,{observe:.30,wonder:.22,rest:.14},['경주한다','어느게먼저','한참본다']),
  // 시간대 (3)
  twoD('dawn-mist-field','새벽 밭 안개','nature','🌫️','uncommon',2,{observe:.30,wonder:.24},['낮게깔림','해뜨면걷힘','조용하다']),
  twoD('noon-water-shine','한낮 물빛','nature','✨','uncommon',2,{observe:.30,record:.20},['눈부시다','일렁','논이거울']),
  twoD('evening-window-glow','저녁 창빛','thing','🪟','uncommon',2,{observe:.26,wonder:.24,rest:.14},['하나씩켜진다','밥냄새','집에가고싶다']),
  // 상황형 (2)
  twoD('cat-and-shadow','제 그림자 보는 고양이','animal','🐈','rare',1,{wonder:.36,observe:.30},['갸웃','건드려본다','자기인줄모른다']),
  twoD('bird-riding-cow','소 등의 새','animal','🐄','rare',1,{observe:.34,wonder:.30,record:.22},['서로편하다','벌레잡아줌','소는신경안씀']),
  // 이상하고 웃긴 것 (3)
  twoD('umbrella-hat','우산 쓴 허수아비','thing','🎃','rare',1,{wonder:.40,observe:.26},['누가씌워줌','비맞지말라고','정작새는']),
  twoD('cat-in-basket','바구니 낀 고양이','animal','🧺','rare',1,{wonder:.38,observe:.30,record:.20},['못빠져나옴','당황','그냥산다']),
  twoD('backwards-sign','거꾸로 붙은 표지','thing','🪧','rare',1,{wonder:.34,observe:.24},['읽으려면','고개를돌려야','아무도안고침']),
  // 극희귀 (1)
  twoD('otter-river','수달','rare','🦦','rare',0,{wonder:.65,observe:.4,record:.35},['정말수달','물이깨끗하다는뜻','금방사라짐'],[],{rareEvent:true}),

  /* ---- batch 3 (251–275) ---- */
  // 일상·생활 (5)
  twoD('rubber-band-ball','고무줄 뭉치','thing','⚪','common',3,{observe:.22,wonder:.14},['왜모았나','점점커짐','튀길까']),
  twoD('calendar-old','지난 달력','thing','📅','uncommon',2,{observe:.26,wonder:.20,record:.14},['안넘겼다','그날에멈춤','벽에']),
  twoD('mirror-crack','금 간 거울','thing','🪞','rare',1,{wonder:.32,observe:.26},['조각조각','일곱해','안버렸다']),
  twoD('pill-box','약통','thing','💊','common',3,{observe:.22,wonder:.14},['요일별로','누군가매일','창턱에']),
  twoD('rope-coil','감아둔 밧줄','thing','🪢','common',3,{observe:.20},['가지런히','언젠가쓸','헛간']),
  // 자연·흔적 (5)
  twoD('nut-shell-split','쪼개진 껍질','nature','🥜','common',3,{observe:.24,wonder:.16},['깔끔하다','이빨자국','다람쥐솜씨']),
  twoD('fern-curl','고사리 순','nature','🌿','uncommon',2,{observe:.30,record:.18,wonder:.14},['돌돌말림','펴지기전','봄산']),
  twoD('bird-track-mud','진흙 새 발자국','nature','🐦','uncommon',2,{observe:.28,wonder:.18},['세갈래','가벼웠다','물가']),
  twoD('honeycomb-old','빈 벌집','nature','🍯','rare',1,{observe:.32,wonder:.28,record:.18},['육각형','완벽하다','아무도없다']),
  twoD('tree-hole-water','나무 구멍 물','nature','💧','uncommon',2,{observe:.30,wonder:.24},['고였다','새가마신다','작은샘']),
  // 계절 (3)
  twoD('plum-blossom','매화','nature','🌸','uncommon',2,{observe:.34,record:.22,wonder:.16},['눈속에핀다','제일먼저','향이멀리']),
  twoD('bare-vine','마른 덩굴','nature','🍂','common',3,{observe:.24,wonder:.16},['잎다졌다','뼈대만','겨울에보인다']),
  twoD('rice-stubble','벼 그루터기','nature','🌾','uncommon',2,{observe:.26,record:.14},['추수뒤','줄맞춰','논이비었다']),
  // 날씨 (3)
  twoD('heat-shimmer','아지랑이','nature','🌡️','uncommon',2,{observe:.28,wonder:.26},['일렁인다','한여름','신기루같다']),
  twoD('wind-flag','펄럭이는 깃발','thing','🚩','common',3,{observe:.24,wonder:.16},['방향을안다','소리가난다','바랬다']),
  twoD('frost-shadow','서리 안 닿은 자리','nature','❄️','rare',1,{observe:.32,wonder:.28,record:.18},['여기만녹색','뭐가있었나','그림자모양']),
  // 시간대 (2)
  twoD('morning-glory-open','아침에 핀 나팔꽃','nature','🌺','uncommon',2,{observe:.32,record:.20},['해뜨면','오후엔닫힘','하루만']),
  twoD('night-window-tv','밤 TV 불빛','thing','📺','uncommon',2,{observe:.24,wonder:.24},['파랗게깜빡','늦게까지','혼자보나']),
  // 상황형 (3)
  twoD('cat-drinking-puddle','웅덩이 마시는 고양이','animal','🐈','rare',1,{observe:.34,record:.24,wonder:.18},['혀가빠르다','귀가움직','경계중']),
  twoD('sparrow-dust-bath','모래 목욕 참새','animal','🐦','rare',1,{observe:.34,wonder:.28,record:.22},['푸드덕','흙먼지','기분좋아보인다']),
  twoD('dog-chasing-tail','꼬리 쫓는 개','animal','🐕','rare',1,{wonder:.36,observe:.30,record:.20},['빙글빙글','못잡는다','즐거워보인다']),
  // 이상하고 웃긴 것 (3)
  twoD('pot-on-head-scarecrow','냄비 쓴 허수아비','thing','🥘','rare',1,{wonder:.40,observe:.26},['모자가없어서','반짝여서','더무섭나']),
  twoD('cat-loaf-fence','담장의 식빵 고양이','animal','🐈','rare',1,{wonder:.36,observe:.30,record:.22},['좁은데','어떻게','떨어질것같다']),
  twoD('bicycle-upside','거꾸로 선 자전거','thing','🚲','rare',1,{wonder:.34,observe:.26},['수리중인가','몇달째','바퀴만돈다']),
  // 극희귀 (1)
  twoD('kingfisher','물총새','rare','🐦','rare',0,{wonder:.65,observe:.45,record:.4},['파란섬광','물속으로','한번뿐'],[],{rareEvent:true}),

  /* ---- batch 4 (276–300) ---- */
  // 일상·생활 (5)
  twoD('chopping-block','도마','thing','🔪','common',3,{observe:.22,record:.10},['칼자국많다','움푹','오래썼다']),
  twoD('grain-scale','저울','thing','⚖️','uncommon',2,{observe:.26,wonder:.16},['녹슨추','기울어짐','아직맞을까']),
  twoD('lantern-broken','깨진 등','thing','🏮','uncommon',2,{observe:.24,wonder:.20},['유리없다','불도없다','걸려만있다']),
  twoD('washboard','빨래판','thing','🧼','uncommon',2,{observe:.26,record:.12},['골이닳음','손빨래','세워둠']),
  twoD('key-rusted','녹슨 열쇠','thing','🔑','rare',1,{wonder:.34,observe:.26,record:.16},['어느문일까','아무데도안맞음','땅에']),
  // 자연·흔적 (5)
  twoD('feather-stuck','박힌 깃털','nature','🪶','uncommon',2,{observe:.28,wonder:.22},['땅에꽂힘','수직으로','부딪혔나']),
  twoD('worm-cast-pile','지렁이 무더기','nature','🪱','common',3,{observe:.22,wonder:.14},['밤새','수북','흙이좋다는뜻']),
  twoD('cracked-mud','갈라진 논바닥','nature','🏜️','uncommon',2,{observe:.28,wonder:.20},['가뭄','조각조각','비가필요']),
  twoD('bird-egg-blue','파란 알','nature','🥚','rare',1,{observe:.34,wonder:.32,record:.22},['이런색이','작다','손대면안된다']),
  twoD('snail-trail','달팽이 지나간 길','nature','🐌','uncommon',2,{observe:.28,wonder:.22},['반짝인다','구불구불','아직축축']),
  // 계절 (4)
  twoD('tadpole-legs','다리 난 올챙이','animal','🐸','rare',1,{observe:.34,wonder:.30,record:.18},['벌써다리가','꼬리는남음','중간단계']),
  twoD('shade-net','차광막','thing','⛱️','uncommon',2,{observe:.22},['한여름','검은그물','밭위로']),
  twoD('persimmon-dry','곶감','thing','🍊','uncommon',2,{observe:.28,record:.18},['줄줄이','하얗게분','겨울간식']),
  twoD('ice-fishing-hole','얼음 구멍','nature','🕳️','rare',1,{observe:.30,wonder:.28},['누가뚫었나','까맣다','물이보인다']),
  // 날씨 (2)
  twoD('puddle-sky-cloud','구름 담긴 웅덩이','nature','☁️','uncommon',2,{observe:.32,wonder:.26,record:.20},['하늘이내려옴','흔들린다','밟기전에']),
  twoD('snow-on-wire','전선 위 눈','nature','❄️','uncommon',2,{observe:.28,record:.16},['가늘게쌓임','곧떨어질것','일자로']),
  // 시간대 (3)
  twoD('sunrise-window','해 드는 창','thing','🌅','uncommon',2,{observe:.30,wonder:.22,rest:.14},['먼지가보인다','빛기둥','아침에만']),
  twoD('afternoon-nap-mat','낮잠 자리','rest','😴','uncommon',2,{rest:.38,observe:.16},['자국이남음','아무도없다','베개는화분']),
  twoD('night-moth-window','창의 밤나방','animal','🦋','uncommon',2,{observe:.26,wonder:.24},['안쪽을본다','계속','들어오려고']),
  // 상황형 (2)
  twoD('cat-cleaning','세수하는 고양이','animal','🐈','rare',1,{observe:.34,rest:.22,record:.20},['앞발로','한참','안본척한다']),
  twoD('birds-fighting','다투는 새들','animal','🐦','rare',1,{observe:.32,wonder:.26,record:.18},['시끄럽다','빵조각하나','둘다못먹음']),
  // 이상하고 웃긴 것 (2)
  twoD('scarecrow-fashion','옷 잘입은 허수아비','thing','🧥','rare',1,{wonder:.40,observe:.28,record:.20},['나보다낫다','넥타이까지','누가입혔나']),
  twoD('cat-stuck-tree','나무에 오른 고양이','animal','🌳','rare',1,{wonder:.36,observe:.30},['못내려온다','울고있다','올라갈땐몰랐지']),
  // 극희귀 (2)
  twoD('leopard-cat','삵','rare','🐈','rare',0,{wonder:.7,observe:.45,record:.4},['고양이가아니다','점무늬','눈이달랐다'],[],{rareEvent:true}),
  twoD('sun-pillar','태양 기둥','rare','🌇','rare',0,{wonder:.65,observe:.4,record:.35},['빛이서있다','아주추운날','사진이안담는다'],[],{rareEvent:true}),

  /* ===== BUILD 414-E — 오브젝트 301–400 =========================================
     ---- batch 1 (301–325) ---- */
  // 일상·생활 (5)
  twoD('bottle-cap-pile','병뚜껑 무더기','thing','🔵','common',3,{observe:.22,wonder:.14},['모아둠','왜','색이제각각']),
  twoD('shoe-mud-scraper','흙털이','thing','🧱','common',3,{observe:.20},['현관앞','쇠막대','다들여기서']),
  twoD('window-tape','창문 테이프','thing','✖️','uncommon',2,{observe:.24,wonder:.18},['태풍때붙임','안뗐다','바랬다']),
  twoD('gas-canister','부탄 가스통','thing','🔥','common',3,{observe:.20,wonder:.12},['빈것','굴러다님','찌그러짐']),
  twoD('cutting-shears','전정가위','thing','✂️','uncommon',2,{observe:.24,record:.10},['날이잘든다','나무옆','잊고둠']),
  // 자연·흔적 (5)
  twoD('tree-sap-crystal','굳은 송진','nature','💎','rare',1,{observe:.32,wonder:.28,record:.18},['호박색','단단해짐','수백년뒤엔']),
  twoD('bird-shadow-wall','벽의 새 그림자','nature','🕊️','uncommon',2,{observe:.30,wonder:.26},['잠깐스침','벌써없다','올려다봤다']),
  twoD('grass-flat-spot','풀 눌린 자리','nature','🌾','uncommon',2,{observe:.28,wonder:.26},['누가누웠나','동물일것','아직따뜻할까']),
  twoD('acorn-sprout','싹 난 도토리','nature','🌱','rare',1,{observe:.32,wonder:.30,record:.20},['잊혀진것','살아남음','언젠가나무']),
  twoD('spider-egg-sac','거미 알집','nature','🕷️','rare',1,{observe:.30,wonder:.30},['하얀주머니','수백마리','건드리면안됨']),
  // 계절 (4)
  twoD('spring-rain-sprout','봄비 뒤 새싹','nature','🌱','uncommon',2,{observe:.32,record:.18},['하룻밤새','일제히','연두색']),
  twoD('summer-mat-shade','나무 그늘 평상','rest','🪑','uncommon',2,{rest:.38,observe:.20,record:.14},['나무그늘','수박먹던','반질반질']),
  twoD('autumn-scarecrow-lean','기운 허수아비','thing','🎃','uncommon',2,{observe:.26,wonder:.20},['일이끝났다','비스듬','내년에도']),
  twoD('winter-straw-wrap','짚 두른 나무','nature','🎋','uncommon',2,{observe:.28,wonder:.20,record:.14},['추울까봐','정성스럽게','벌레잡이']),
  // 날씨 (3)
  twoD('typhoon-branch','부러진 큰 가지','nature','🌳','rare',1,{observe:.30,wonder:.24},['어젯밤바람','길을막음','아직안치움']),
  twoD('rainbow-mist','물보라 무지개','nature','🌈','rare',1,{observe:.32,wonder:.32,record:.24},['호스에서','작게','각도맞아야']),
  twoD('frost-heave','서릿발','nature','❄️','uncommon',2,{observe:.30,wonder:.26},['흙이솟았다','밟으면바스락','밤새자랐다']),
  // 시간대 (2)
  twoD('dawn-newspaper','새벽 신문','thing','📰','uncommon',2,{observe:.26,wonder:.16},['던져져있다','아직젖음','아무도안읽음']),
  twoD('dusk-smoke-line','저녁 연기 줄','thing','💨','uncommon',2,{observe:.28,wonder:.24,record:.16},['여러집에서','곧게오른다','바람이없다']),
  // 상황형 (3)
  twoD('cat-in-doorway','문간의 고양이','animal','🚪','rare',1,{observe:.34,wonder:.24},['들어갈까말까','한참','결국안들어감']),
  twoD('sparrow-in-gutter','홈통 속 참새','animal','🐦','rare',1,{observe:.32,wonder:.28,record:.18},['비피함','머리만','안나온다']),
  twoD('dog-under-bench','벤치 밑 개','animal','🐕','rare',1,{observe:.32,rest:.26,record:.18},['그늘딱맞음','늘어짐','안비킨다']),
  // 이상하고 웃긴 것 (2)
  twoD('shoe-tree-hanging','나뭇가지 운동화','thing','👟','rare',1,{wonder:.40,observe:.26},['끈으로묶여','높다','전통인가']),
  twoD('cat-on-laundry','빨래 위 고양이','animal','👕','rare',1,{wonder:.36,observe:.30,record:.22},['방금널었는데','따뜻해서','다시빨아야']),
  // 극희귀 (1)
  twoD('mandarin-duck','원앙','rare','🦆','rare',0,{wonder:.65,observe:.45,record:.4},['색이비현실적','둘이같이','조용히지나갔다'],[],{rareEvent:true}),

  /* ---- batch 2 (326–350) ---- */
  // 일상·생활 (5)
  twoD('washing-powder','세제 상자','thing','🧼','common',3,{observe:.20},['눅눅해짐','수돗가','반쯤남음']),
  twoD('rice-bowl-stack','포개둔 그릇','thing','🥣','common',3,{observe:.22,record:.10},['씻어말림','기울여','물이흐른다']),
  twoD('nail-jar','못 담은 병','thing','🔩','common',3,{observe:.24,wonder:.14},['크기섞임','언젠가','헛간선반']),
  twoD('rain-boots-pair','나란한 장화','thing','🥾','common',3,{observe:.24,record:.12},['짝이맞다','거꾸로','마르는중']),
  twoD('fuse-box','두꺼비집','thing','⚡','uncommon',2,{observe:.22,wonder:.16},['내려간적있다','오래된','손대기무섭다']),
  // 자연·흔적 (5)
  twoD('cicada-hole','매미 나온 구멍','nature','🕳️','uncommon',2,{observe:.30,wonder:.26},['땅에동그랗게','칠년만에','여름시작']),
  twoD('leaf-pile-wet','젖은 낙엽 더미','nature','🍂','common',3,{observe:.24,wonder:.14},['미끄럽다','냄새가난다','바닥에붙음']),
  twoD('bird-scratch-dirt','새가 헤집은 흙','nature','🐦','uncommon',2,{observe:.26,wonder:.18},['부채꼴','벌레찾기','여러번']),
  twoD('mushroom-shelf','나무 버섯','nature','🍄','uncommon',2,{observe:.30,wonder:.22,record:.16},['층층이','죽은나무에','단단하다']),
  twoD('frog-in-pipe','관 속 개구리','animal','🐸','rare',1,{observe:.32,wonder:.30},['울음이울린다','증폭됨','안보인다']),
  // 계절 (4)
  twoD('cherry-petal-water','꽃잎 뜬 물','nature','🌸','rare',1,{observe:.34,wonder:.28,record:.24},['분홍이돈다','봄끝','건지고싶다']),
  twoD('bamboo-water-pipe','대나무 물길','thing','🎋','uncommon',2,{observe:.28,wonder:.20},['졸졸','여름','시원하다']),
  twoD('chili-drying-roof','지붕 위 고추','thing','🌶️','uncommon',2,{observe:.26,record:.16},['빨갛게','가을볕','새가노린다']),
  twoD('snow-hat-post','눈 모자 쓴 기둥','nature','⛄','uncommon',2,{observe:.28,wonder:.20,record:.14},['딱맞게','귀엽다','아무도안털었다']),
  // 날씨 (2)
  twoD('hail-dent-leaf','우박 맞은 잎','nature','🧊','rare',1,{observe:.30,wonder:.24},['구멍났다','어젯밤','아팠겠다']),
  twoD('wind-broken-fence','바람에 넘어진 울타리','thing','🪵','uncommon',2,{observe:.26,wonder:.16},['한칸만','비스듬','고쳐야하는데']),
  // 시간대 (3)
  twoD('morning-frost-car','서리 낀 차','thing','🚗','uncommon',2,{observe:.28,record:.16},['긁어야한다','손자국','아침마다']),
  twoD('noon-shadow-short','정오 짧은 그림자','nature','☀️','uncommon',2,{observe:.26,wonder:.20},['발밑에','제일짧다','해가높다']),
  twoD('night-cat-eyes','밤 고양이 눈','animal','🐈','rare',1,{wonder:.36,observe:.30},['두점','반사된다','몸은안보인다']),
  // 상황형 (2)
  twoD('bird-bath-bowl','대야의 새','animal','🐦','rare',1,{observe:.34,record:.24,wonder:.20},['목욕중','물이튄다','신났다']),
  twoD('cat-in-flowerpot','화분 속 고양이','animal','🪴','rare',1,{wonder:.38,observe:.30,record:.22},['꽃은어디','딱맞는다','흙이좋은가']),
  // 이상하고 웃긴 것 (3)
  twoD('helmet-on-post','기둥 위 헬멧','thing','🪖','rare',1,{wonder:.36,observe:.24},['누가올려둠','비맞는중','주인은']),
  twoD('teapot-planter','주전자 화분','thing','🫖','rare',1,{wonder:.34,observe:.26,record:.16},['물따르던것','이제꽃이','구멍뚫음']),
  twoD('scarecrow-two','허수아비 둘','thing','🎃','rare',1,{wonder:.36,observe:.26},['마주보고','대화하는듯','아무말없다']),
  // 극희귀 (1)
  twoD('firefly-swarm','반딧불이 무리','rare','✨','rare',0,{wonder:.7,observe:.45,record:.4},['수십마리','숨이멎었다','물이맑다는뜻'],[],{rareEvent:true}),

  /* ---- batch 3 (351–375) ---- */
  // 일상·생활 (5)
  twoD('doormat-worn','닳은 발매트','thing','🚪','common',3,{observe:.20},['글씨가지워짐','환영이었나','흙투성이']),
  twoD('hose-coiled','감긴 호스','thing','🪢','common',3,{observe:.20,wonder:.10},['초록','벽에걸림','물이조금남음']),
  twoD('cardboard-flat','접힌 박스','thing','📦','common',3,{observe:.18},['묶어둠','재활용','비에젖음']),
  twoD('outdoor-tap-frozen','언 수도꼭지','thing','🧊','uncommon',2,{observe:.26,wonder:.18},['천으로감쌈','터질까봐','겨울준비']),
  twoD('bell-jar-food','밥상보','thing','🍚','uncommon',2,{observe:.26,wonder:.16},['덮어둠','누굴기다리나','파리막이']),
  // 자연·흔적 (5)
  twoD('roots-in-crack','틈의 뿌리','nature','🌿','uncommon',2,{observe:.30,wonder:.24},['콘크리트를','밀어올린다','천천히이긴다']),
  twoD('bird-nest-eaves','처마 밑 둥지','nature','🪹','rare',1,{observe:.32,wonder:.26,record:.20},['매년온다','조용히','새끼소리']),
  twoD('lizard-sunning','볕 쬐는 도마뱀','animal','🦎','uncommon',2,{observe:.32,wonder:.24,record:.16},['돌위에','미동없다','다가가면사라짐']),
  twoD('web-with-catch','걸린 거미줄','nature','🕸️','uncommon',2,{observe:.30,wonder:.26},['뭔가걸렸다','흔들린다','자연스럽다']),
  twoD('pine-needle-bed','솔잎 바닥','nature','🌲','common',3,{observe:.24,rest:.14},['푹신하다','미끄럽다','냄새가좋다']),
  // 계절 (3)
  twoD('spring-frog-chorus','봄 개구리 합창','animal','🐸','uncommon',2,{observe:.28,wonder:.26},['논전체가','시끄럽다','밤마다']),
  twoD('summer-shade-tunnel','나무 터널','nature','🌳','uncommon',2,{observe:.30,rest:.22,record:.18},['갑자기시원','초록이덮음','끝이보인다']),
  twoD('winter-bare-branch','겨울 맨가지','nature','🌿','common',3,{observe:.26,wonder:.18},['하늘이보인다','뼈대','잎이없어야보임']),
  // 날씨 (3)
  twoD('drizzle-lamp-halo','가랑비 등불 무리','thing','💡','uncommon',2,{observe:.28,wonder:.26},['번진다','동그랗게','비가보인다']),
  twoD('wind-leaf-spiral','잎 회오리','nature','🍂','rare',1,{wonder:.34,observe:.28,record:.18},['빙글','모퉁이에서','잠깐춤춘다']),
  twoD('snow-melt-drip','녹는 눈 물방울','nature','💧','uncommon',2,{observe:.28,wonder:.20},['똑','처마끝','봄이온다']),
  // 시간대 (2)
  twoD('dawn-bird-first','첫 새소리','animal','🐦','uncommon',2,{observe:.28,wonder:.24},['아직어둡다','하나가시작','곧합창']),
  twoD('night-street-empty','빈 밤길','rest','🌃','uncommon',2,{observe:.26,rest:.20,wonder:.22},['아무도없다','가로등만','발소리가크다']),
  // 상황형 (3)
  twoD('cat-and-moth','나방 보는 고양이','animal','🦋','rare',1,{observe:.34,wonder:.30,record:.20},['앞발을든다','아직안친다','집중']),
  twoD('bird-on-mirror','거울 쪼는 새','animal','🪞','rare',1,{wonder:.40,observe:.30},['자기인줄모른다','계속','싸우는중']),
  twoD('dog-watching-gate','문 보는 개','animal','🐕','rare',1,{observe:.34,wonder:.28,record:.20},['안짖는다','귀만','기다린다']),
  // 이상하고 웃긴 것 (3)
  twoD('sock-on-cat','양말 신은 고양이','animal','🧦','rare',1,{wonder:.42,observe:.30,record:.22},['한짝만','걸음이이상','곧벗을것']),
  twoD('umbrella-drying-upside','거꾸로 말리는 우산','thing','☂️','rare',1,{wonder:.32,observe:.24},['물이고임','뒤집힌게아님','일부러']),
  twoD('pot-lid-fence','울타리의 냄비뚜껑','thing','🥘','rare',1,{wonder:.36,observe:.24},['왜여기','반짝인다','새쫓는용도']),
  // 극희귀 (1)
  twoD('white-heron','백로','rare','🕊️','rare',0,{wonder:.65,observe:.45,record:.4},['논한가운데','미동없다','날때는느리다'],[],{rareEvent:true}),

  /* ---- batch 4 (376–400) ---- */
  // 일상·생활 (5)
  twoD('propane-heater','석유 난로','rest','🔥','uncommon',2,{rest:.30,observe:.22},['심지올림','주전자를올린다','냄새가난다']),
  twoD('sewing-machine','재봉틀','rest','🧵','rare',1,{observe:.30,rest:.14,record:.18},['발판이있다','먼지앉음','아직돌까']),
  twoD('school-bag','책가방','thing','🎒','uncommon',2,{observe:.26,wonder:.18},['마루에던짐','주인은놀러감','무거워보인다']),
  twoD('dish-rack','그릇 건조대','thing','🍽️','common',3,{observe:.20},['물이떨어진다','가지런','햇볕에']),
  twoD('mosquito-coil','모기향','thing','🌀','uncommon',2,{observe:.26,wonder:.18},['다타간다','재가떨어짐','여름밤']),
  // 자연·흔적 (5)
  twoD('bird-wing-print','눈 위 날개 자국','nature','🪶','rare',1,{observe:.34,wonder:.34,record:.24},['부채꼴','뭔가잡혔다','흔적만']),
  twoD('tree-lean-wind','바람에 기운 나무','nature','🌳','uncommon',2,{observe:.28,wonder:.22},['한쪽으로','평생그랬다','바람방향을안다']),
  twoD('ant-vs-bug','개미와 벌레','animal','🐜','rare',1,{observe:.32,wonder:.28},['여럿이','끌고간다','치열하다']),
  twoD('moss-north','북쪽 이끼','nature','🧭','uncommon',2,{observe:.28,wonder:.24},['한쪽만','방향을안다','축축']),
  twoD('leaf-in-web','거미줄의 잎','nature','🍃','uncommon',2,{observe:.28,wonder:.22},['먹이가아니다','걸려서','흔들린다']),
  // 계절 (4)
  twoD('spring-plow','갈아엎은 밭','nature','🌾','uncommon',2,{observe:.26,record:.14},['골이생김','흙냄새','뭘심을까']),
  twoD('summer-fan-outdoor','마당 선풍기','thing','💨','uncommon',2,{observe:.24,rest:.18},['밖에서','고개돌린다','전선이길다']),
  twoD('autumn-persimmon-tree','감나무','nature','🍊','uncommon',2,{observe:.30,record:.20,wonder:.14},['주황이가득','가지가휘었다','까치몫']),
  twoD('winter-boiler-pipe','보일러 연통','thing','🏠','uncommon',2,{observe:.22,wonder:.16},['김이나온다','따뜻하다는뜻','벽에']),
  // 날씨 (2)
  twoD('sun-through-cloud','구름 사이 빛','nature','🌤️','rare',1,{observe:.32,wonder:.32,record:.24},['기둥처럼','내려온다','잠깐']),
  twoD('rain-ring-puddle','빗방울 파문','nature','🌧️','uncommon',2,{observe:.30,wonder:.24,record:.18},['동그라미','겹친다','계속생긴다']),
  // 시간대 (3)
  twoD('morning-glory-fence','아침 울타리 나팔꽃','nature','🌺','uncommon',2,{observe:.30,record:.20},['타고올랐다','아침에만','보라색']),
  twoD('noon-empty-road','한낮 빈 길','rest','🛣️','uncommon',2,{observe:.24,rest:.20,wonder:.18},['아무도없다','너무덥다','아지랑이']),
  twoD('evening-bat-lamp','저녁 가로등 박쥐','animal','🦇','rare',1,{observe:.30,wonder:.32},['벌레를노린다','빠르다','불규칙']),
  // 상황형 (2)
  twoD('cat-in-window-inside','창 안의 고양이','animal','🪟','rare',1,{observe:.34,wonder:.26,record:.20},['유리너머','눈이마주쳤다','나가고싶은가']),
  twoD('bird-family-line','줄지은 새 가족','animal','🐦','rare',1,{observe:.36,wonder:.30,record:.26},['어미뒤로','작은것들','흩어지지않는다']),
  // 이상하고 웃긴 것 (2)
  twoD('cat-tail-only','꼬리만 보이는 고양이','animal','🐈','rare',1,{wonder:.40,observe:.30,record:.20},['숨었다고생각','다보인다','움직인다']),
  twoD('boot-flower-pair','장화 화분 한쌍','thing','🥾','rare',1,{wonder:.34,observe:.26,record:.18},['짝이맞다','꽃이달라','재활용']),
  // 극희귀 (2)
  twoD('eagle-owl','수리부엉이','rare','🦉','rare',0,{wonder:.7,observe:.45,record:.4},['눈이주황','아주크다','소리없이날았다'],[],{rareEvent:true}),
  twoD('cloud-iridescent','채운','rare','🌈','rare',0,{wonder:.7,observe:.45,record:.4},['구름이무지개색','상서롭다고','한참올려다봤다'],[],{rareEvent:true}),

  /* ===== BUILD 414-F — 오브젝트 401–500 =========================================
     ---- batch 1 (401–425) ---- */
  // 일상·생활 (5)
  twoD('ash-pile','아궁이 재','thing','🔥','uncommon',2,{observe:.24,wonder:.14},['곱다','아직따뜻','밭에뿌린다']),
  twoD('paper-bag-wet','젖은 종이봉투','thing','🛍️','common',3,{observe:.20,wonder:.12},['찢어짐','내용물은','비를만났다']),
  twoD('clothes-pin-jar','집게 통','thing','🧺','common',3,{observe:.22},['빨래줄옆','나무집게','섞여있다']),
  twoD('kimchi-fridge','김치냉장고','thing','🧊','uncommon',2,{observe:.22,wonder:.14},['마당에','돌아간다','스티커붙음']),
  twoD('shovel-in-dirt','꽂힌 삽','thing','🪏','common',3,{observe:.24,wonder:.12},['일하다말고','반쯤박힘','주인은어디']),
  // 자연·흔적 (5)
  twoD('bee-dead','죽은 벌','nature','🐝','uncommon',2,{observe:.28,wonder:.28},['창턱에','뒤집힘','일생이짧다']),
  twoD('bark-beetle-trail','나무껍질 벌레길','nature','🪵','uncommon',2,{observe:.30,wonder:.26,record:.16},['글씨같다','읽을수없다','속으로갔다']),
  twoD('bird-cache-nut','새가 박은 도토리','nature','🌰','rare',1,{observe:.32,wonder:.30},['나무틈에','정확하게','기억할까']),
  twoD('deer-rub-tree','뿔 비빈 나무','nature','🦌','rare',1,{observe:.30,wonder:.26},['껍질벗겨짐','같은높이','밤에왔다']),
  twoD('vine-strangle','휘감은 덩굴','nature','🌿','uncommon',2,{observe:.28,wonder:.24},['조여든다','천천히','나무가진다']),
  // 계절 (4)
  twoD('spring-nest-material','둥지 재료 나르는 새','animal','🪶','rare',1,{observe:.32,wonder:.28,record:.20},['입에물고','여러번','짓는중']),
  twoD('summer-well-cold','두레박 냉장고','thing','🪣','uncommon',2,{observe:.28,wonder:.22},['수박담가둠','시원하다','옛날냉장고']),
  twoD('autumn-seed-fly','날아가는 씨앗','nature','🌾','uncommon',2,{observe:.30,wonder:.28,record:.18},['낙하산','바람타고','어디까지']),
  twoD('winter-bird-feeder','겨울 모이통','thing','🐦','uncommon',2,{observe:.28,record:.18},['누가달았나','줄이선다','비었다']),
  // 날씨 (3)
  twoD('rain-gauge','우량계','thing','📏','uncommon',2,{observe:.26,wonder:.16},['눈금','어제만큼','누가읽나']),
  twoD('fog-valley','골짜기 안개','nature','🌫️','uncommon',2,{observe:.30,wonder:.28,record:.20},['강처럼흐른다','아래만','산이섬']),
  twoD('snow-blower-mark','눈 치운 자국','nature','⛄','uncommon',2,{observe:.24,wonder:.14},['깔끔하다','양옆으로','기계였나']),
  // 시간대 (2)
  twoD('dawn-fisher','새벽 낚시꾼','thing','🎣','rare',1,{observe:.28,wonder:.26},['움직이지않는다','안개속','인기척']),
  twoD('night-truck-light','밤 트럭 불빛','thing','🚚','uncommon',2,{observe:.24,wonder:.22},['멀리서','지나간다','소리가먼저']),
  // 상황형 (3)
  twoD('cat-fight-sound','안 보이는 고양이 싸움','animal','😾','rare',1,{wonder:.36,observe:.26},['소리만','어디선가','무섭다']),
  twoD('bird-chase-hawk','매 쫓는 작은 새','animal','🦅','rare',1,{observe:.34,wonder:.34,record:.24},['훨씬작은데','물러서지않는다','둥지가있나']),
  twoD('dog-and-ball','공 앞의 개','animal','⚽','rare',1,{observe:.32,wonder:.24,record:.18},['던져달라고','안짖는다','기다림']),
  // 이상하고 웃긴 것 (2)
  twoD('cat-on-scarecrow','허수아비 어깨 고양이','animal','🐈','rare',1,{wonder:.42,observe:.30,record:.24},['둘다안움직임','누가더허수아비','새는신경안씀']),
  twoD('tire-planter','타이어 화분','thing','🛞','rare',1,{wonder:.32,observe:.26},['하얗게칠함','꽃이산다','굴러가던것']),
  // 극희귀 (1)
  twoD('badger-night','오소리','rare','🦡','rare',0,{wonder:.65,observe:.45,record:.4},['통통했다','뒤뚱','금방숲으로'],[],{rareEvent:true}),

  /* ---- batch 2 (426–450) ---- */
  // 일상·생활 (5)
  twoD('rubber-slippers','고무 슬리퍼','thing','🩴','common',3,{observe:.20,record:.10},['뒤축닳음','아무나신는다','마루밑']),
  twoD('bug-net','잠자리채','thing','🪆','uncommon',2,{observe:.24,wonder:.20},['그물이찢김','벽에','여름것']),
  twoD('rice-bag-empty','빈 쌀포대','thing','🌾','common',3,{observe:.20},['접어둠','글씨가큼','다른데쓴다']),
  twoD('kettle-black','까만 주전자','thing','🫖','common',3,{observe:.22,rest:.12},['불에오래','손잡이는나무','물맛이다르다']),
  twoD('door-latch','문고리','thing','🚪','common',3,{observe:.24,wonder:.14},['닳아반질','수백번','손이기억한다']),
  // 자연·흔적 (5)
  twoD('grass-seed-stick','옷에 붙는 씨앗','nature','🌾','uncommon',2,{observe:.26,wonder:.22},['도깨비바늘','떼어도','또붙는다']),
  twoD('bird-poop-line','전선 아래','nature','🐦','common',3,{observe:.22,wonder:.16},['하얗게줄','늘같은자리','피해다닌다']),
  twoD('log-mushroom-farm','표고 원목','nature','🍄','uncommon',2,{observe:.28,record:.16},['세워둠','구멍마다','기다림']),
  twoD('crab-shell-molt','게 허물','nature','🦀','rare',1,{observe:.30,wonder:.30},['통째로','속이비었다','더커졌겠지']),
  twoD('bird-preen-feather','다듬은 깃털','nature','🪶','uncommon',2,{observe:.26,wonder:.20},['한자리에','여러개','오래앉았다']),
  // 계절 (4)
  twoD('spring-bud-swell','부푼 겨울눈','nature','🌱','uncommon',2,{observe:.30,wonder:.24},['터지기직전','빨갛다','곧']),
  twoD('summer-ice-bar','얼음 동동','thing','🧊','uncommon',2,{observe:.26,rest:.18},['땀이맺힌다','컵밖에','금방녹는다']),
  twoD('autumn-rake-line','갈퀴 자국','nature','🍂','uncommon',2,{observe:.26,wonder:.16},['줄무늬','정성','또떨어진다']),
  twoD('winter-icicle-row','고드름 줄','nature','🧊','uncommon',2,{observe:.30,record:.20},['크기가다르다','처마따라','떨어지면위험']),
  // 날씨 (2)
  twoD('wind-sock','바람 자루','thing','🎏','uncommon',2,{observe:.26,wonder:.18},['부풀었다','방향','축들때도']),
  twoD('rain-barrel','빗물 통','thing','🛢️','uncommon',2,{observe:.24,wonder:.16},['가득찼다','모기가살까','밭에준다']),
  // 시간대 (3)
  twoD('dawn-bread-light','새벽 불 켠 부엌','thing','🍞','uncommon',2,{observe:.26,wonder:.24},['제일먼저','누가일어났다','따뜻해보인다']),
  twoD('noon-bell-tower','정오 종탑','thing','🔔','uncommon',2,{observe:.26,wonder:.20},['열두번','마을전체','시계가없어도']),
  twoD('night-star-reflect','별 비친 논','nature','✨','rare',1,{observe:.34,wonder:.34,record:.26},['위아래가같다','발밑에하늘','걷기미안하다']),
  // 상황형 (2)
  twoD('cat-carrying-kitten','새끼 문 어미 고양이','animal','🐈','rare',1,{observe:.36,wonder:.34,record:.28},['목덜미를','조심히','이사중']),
  twoD('bird-in-scarecrow-hat','허수아비 모자 속 둥지','animal','🪹','rare',1,{wonder:.42,observe:.32,record:.24},['안이비었다','아늑한가','완전히졌다']),
  // 이상하고 웃긴 것 (3)
  twoD('cat-sleeping-tool','연장 위 고양이','animal','🔧','rare',1,{wonder:.36,observe:.28},['일못한다','비켜주지않음','포기']),
  twoD('umbrella-tree','우산 걸린 나무','thing','☂️','rare',1,{wonder:.34,observe:.24},['바람에날림','높이걸림','못뗀다']),
  twoD('mirror-on-tree','나무의 거울','thing','🪞','rare',1,{wonder:.38,observe:.28},['왜여기','숲이비친다','누가걸었나']),
  // 극희귀 (1)
  twoD('wild-boar-family','멧돼지 가족','rare','🐗','rare',0,{wonder:.7,observe:.45,record:.35},['새끼가줄무늬','조용히','숨을참았다'],[],{rareEvent:true}),

  /* ---- batch 3 (451–475) ---- */
  // 일상·생활 (5)
  twoD('gourd-hanging','매달린 조롱박','thing','🥒','uncommon',2,{observe:.28,wonder:.20},['시렁위','말리는중','바가지될것']),
  twoD('coal-hole','연탄 구멍 뚫개','thing','🔧','uncommon',2,{observe:.22,wonder:.16},['쇠막대','아궁이옆','손잡이가뜨겁다']),
  twoD('chalk-wall','분필 낙서','thing','✏️','uncommon',2,{observe:.28,wonder:.24,record:.16},['아이키높이','비오면지워진다','그림']),
  twoD('bench-carved','이름 새긴 벤치','rest','🪑','rare',1,{rest:.30,observe:.28,wonder:.24},['누가누구를','오래됐다','아직있을까']),
  twoD('bicycle-bell-broken','안 울리는 종','thing','🔔','common',3,{observe:.22,wonder:.14},['눌러도','소리가없다','녹']),
  // 자연·흔적 (5)
  twoD('spider-on-web','줄 위의 거미','animal','🕷️','uncommon',2,{observe:.30,wonder:.26},['가운데','미동없다','기다린다']),
  twoD('bee-hive-wild','자연 벌집','nature','🐝','rare',1,{observe:.32,wonder:.32,record:.20},['나무구멍','윙윙','다가가지않는다']),
  twoD('bird-shell-blue','파란 알껍질','nature','🥚','rare',1,{observe:.32,wonder:.30,record:.20},['땅에','무사히나왔나','작은조각']),
  twoD('mole-cricket','땅강아지','animal','🦗','rare',1,{observe:.30,wonder:.30},['앞발이삽','밤에운다','처음본다']),
  twoD('leaf-rolled-bug','말린 잎 속 벌레','nature','🍃','uncommon',2,{observe:.30,wonder:.26},['돌돌','집을지었다','안엔뭐가']),
  // 계절 (3)
  twoD('spring-tea-leaf','찻잎 새순','nature','🍵','uncommon',2,{observe:.30,record:.18},['한잎두잎','손끝으로','향이난다']),
  twoD('summer-corn-tassel','옥수수 수염','nature','🌽','uncommon',2,{observe:.28,record:.16},['갈색이면','다익었다','만져본다']),
  twoD('winter-cabbage-cover','짚 덮은 배추','nature','🥬','uncommon',2,{observe:.26,wonder:.16},['얼지말라고','정성','겨울밭']),
  // 날씨 (3)
  twoD('lightning-far','먼 번개','nature','⚡','rare',1,{wonder:.38,observe:.30},['소리는나중','한참뒤','다가온다']),
  twoD('wind-tree-roar','바람 소리 나무','nature','🌳','uncommon',2,{observe:.26,wonder:.28},['파도같다','올려다본다','눈을감는다']),
  twoD('snow-first-flake','첫눈 한 송이','nature','❄️','rare',1,{observe:.34,wonder:.36,record:.26},['하나만','손에서녹음','올해처음']),
  // 시간대 (2)
  twoD('dawn-cow-bell','새벽 소 방울','animal','🐄','uncommon',2,{observe:.26,wonder:.24},['딸랑','아직어둡다','일어났나보다']),
  twoD('dusk-kite','저녁 연','thing','🪁','rare',1,{observe:.30,wonder:.30,record:.22},['아직떠있다','줄이길다','누가잡고있나']),
  // 상황형 (3)
  twoD('cat-vs-dog-standoff','고양이와 개','animal','🐕','rare',1,{observe:.36,wonder:.30,record:.22},['둘다안움직임','개가먼저','포기했다']),
  twoD('bird-feeding-chick','먹이 주는 새','animal','🐦','rare',1,{observe:.36,wonder:.32,record:.28},['입을벌린다','한입씩','정신없다']),
  twoD('frog-on-lotus','연잎 위 개구리','animal','🐸','rare',1,{observe:.34,wonder:.28,record:.24},['딱맞게','안빠진다','그림같다']),
  // 이상하고 웃긴 것 (3)
  twoD('scarecrow-sunglasses','선글라스 낀 허수아비','thing','🕶️','rare',1,{wonder:.42,observe:.28},['멋있다','누가씌웠나','새는웃는다']),
  twoD('cat-in-shoe','신발 속 고양이','animal','👞','rare',1,{wonder:.40,observe:.30,record:.22},['아기고양이','딱맞음','주인은못신는다']),
  twoD('door-to-nowhere','벽에 난 문','thing','🚪','rare',1,{wonder:.40,observe:.30},['열면벽','왜만들었나','손잡이는있다']),
  // 극희귀 (1)
  twoD('raccoon-dog','너구리','rare','🦝','rare',0,{wonder:.65,observe:.45,record:.4},['눈가가검다','통통','서로놀랐다'],[],{rareEvent:true}),

  /* ---- batch 4 (476–500) ---- */
  // 일상·생활 (5)
  twoD('water-pump-hand','수동 펌프','thing','🚰','uncommon',2,{observe:.28,wonder:.20},['마중물','손잡이가길다','아직나올까']),
  twoD('rice-straw-stack','볏짚 낟가리','thing','🌾','uncommon',2,{observe:.26,record:.14},['둥글게쌓음','겨울소여물','포근해보인다']),
  twoD('tin-cup-hook','걸린 양은컵','thing','🥤','common',3,{observe:.22,rest:.12},['찌그러짐','아무나마신다','물맛이시원']),
  twoD('paper-lantern-torn','찢어진 종이등','thing','🏮','uncommon',2,{observe:.24,wonder:.20},['축제뒤','비맞음','아직걸림']),
  twoD('cement-bag','시멘트 포대','thing','🧱','common',3,{observe:.18},['굳어버림','한쪽구석','돌이됐다']),
  // 자연·흔적 (5)
  twoD('cicada-chorus-tree','매미 나무','animal','🪰','uncommon',2,{observe:.26,wonder:.26},['이나무만','시끄럽다','왜여기만']),
  twoD('bird-territory-sing','노래하는 새','animal','🐦','uncommon',2,{observe:.30,wonder:.24,record:.18},['제일높은가지','같은자리','매일아침']),
  twoD('ants-bridge','개미 다리','animal','🐜','rare',1,{observe:.34,wonder:.34,record:.22},['몸으로','건넌다','믿기힘들다']),
  twoD('tree-two-grown','붙어 자란 나무','nature','🌳','rare',1,{observe:.32,wonder:.30,record:.22},['하나가됐다','언제부터','떼어낼수없다']),
  twoD('bird-eggshell-nest','둥지 옆 껍질','nature','🥚','uncommon',2,{observe:.28,wonder:.26},['다나왔다','어미가치웠나','조각만']),
  // 계절 (4)
  twoD('spring-cow-graze','풀 뜯는 소','animal','🐄','uncommon',2,{observe:.30,rest:.20,record:.16},['천천히','고개를안든다','되새김질']),
  twoD('summer-shade-dog','그늘 찾는 개','animal','🐕','uncommon',2,{observe:.28,rest:.26},['혀를뺐다','안움직인다','해가돌면따라간다']),
  twoD('autumn-rice-gold','황금 들판','nature','🌾','uncommon',2,{observe:.32,record:.24,wonder:.16},['다익었다','고개숙임','바람에물결']),
  twoD('winter-smoke-still','겨울 굴뚝 연기','thing','💨','uncommon',2,{observe:.28,wonder:.22},['수직으로','바람이없다','추운날']),
  // 날씨 (2)
  twoD('sun-dog','무리해','rare','☀️','rare',0,{wonder:.65,observe:.4,record:.35},['해가셋','아주추운날','눈이부시다'],[],{rareEvent:true}),
  twoD('rain-street-shine','비 젖은 길','nature','🌧️','uncommon',2,{observe:.30,wonder:.22,record:.18},['불빛이번진다','반질','조심']),
  // 시간대 (3)
  twoD('morning-market-box','새벽 시장 상자','thing','📦','uncommon',2,{observe:.24,wonder:.18},['벌써와있다','채소가담김','이슬맺힘']),
  twoD('noon-nap-cat-roof','지붕 낮잠 고양이','animal','🐈','rare',1,{observe:.32,rest:.28,record:.22},['제일따뜻한곳','늘어짐','안내려온다']),
  twoD('night-window-last','마지막 불빛','thing','🪟','uncommon',2,{observe:.26,wonder:.26,rest:.16},['다들잠들었다','하나만','누가안자나']),
  // 상황형 (2)
  twoD('cat-bird-ignore','서로 무시','animal','🐈','rare',1,{wonder:.36,observe:.30},['둘다안본척','거리는가깝다','협정인가']),
  twoD('dog-tail-only','꼬리만 흔드는 개','animal','🐕','rare',1,{observe:.30,wonder:.28,record:.20},['풀에가림','꼬리만','기분좋은게보인다']),
  // 이상하고 웃긴 것 (2)
  twoD('boot-on-scarecrow-head','장화 쓴 허수아비','thing','🥾','rare',1,{wonder:.42,observe:.28},['모자대신','거꾸로','새가더당황']),
  twoD('cat-loaf-lineup','줄지은 식빵 고양이','animal','🍞','rare',1,{wonder:.44,observe:.32,record:.26},['셋다똑같이','같은방향','뭘보나']),
  // 극희귀 (2)
  twoD('crane-flying','두루미','rare','🕊️','rare',0,{wonder:.7,observe:.45,record:.4},['날개가아주넓다','목이길다','천천히갔다'],[],{rareEvent:true}),
  twoD('moonbow','달무지개','rare','🌈','rare',0,{wonder:.75,observe:.45,record:.4},['밤에무지개','희미하다','평생한번'],[],{rareEvent:true}),

  /* ===== BUILD 414-G — 오브젝트 501–600 =========================================
     ---- batch 1 (501–525) ---- */
  // 일상·생활 (5)
  twoD('grinding-stone-hand','손 맷돌','rest','🪨','uncommon',2,{observe:.26,rest:.12},['작다','콩을갈던','손잡이가닳음']),
  twoD('bamboo-blind','대발','thing','🎋','uncommon',2,{observe:.26,wonder:.16},['말아올림','볕을가른다','줄무늬그림자']),
  twoD('iron-pot-lid','솥뚜껑','thing','🥘','uncommon',2,{observe:.24,wonder:.14},['뒤집어놓음','전부치던','무겁다']),
  twoD('rope-swing','밧줄 그네','rest','🪢','rare',1,{rest:.32,observe:.28,wonder:.24},['나뭇가지에','아무도안탄다','흔들린다']),
  twoD('mail-pile','쌓인 우편물','thing','📬','uncommon',2,{observe:.26,wonder:.22},['며칠째','아무도안가져감','비에젖음']),
  // 자연·흔적 (5)
  twoD('bird-window-mark','유리에 찍힌 자국','nature','🪶','rare',1,{observe:.32,wonder:.34},['날개모양','부딪혔다','괜찮았을까']),
  twoD('sap-ant-line','진액 개미줄','nature','🐜','uncommon',2,{observe:.30,wonder:.24},['달아서','줄지어','오르내린다']),
  twoD('root-exposed-rain','비에 드러난 뿌리','nature','🌳','uncommon',2,{observe:.28,wonder:.24},['흙이쓸림','붙잡고있다','위태롭다']),
  twoD('bird-bone-pellet','새 소화 뭉치','nature','🦴','rare',1,{observe:.28,wonder:.30},['털과뼈','토해낸것','증거같다']),
  twoD('moss-carpet','이끼 융단','nature','🟢','uncommon',2,{observe:.30,rest:.16,record:.16},['푹신하다','밟기미안','수십년']),
  // 계절 (4)
  twoD('spring-butterfly-first','첫 나비','animal','🦋','rare',1,{observe:.32,wonder:.34,record:.24},['벌써','노랗다','봄이맞다']),
  twoD('summer-watermelon-well','우물 속 수박','thing','🍉','uncommon',2,{observe:.28,wonder:.22},['줄에매달아','차갑다','기다린다']),
  twoD('autumn-chestnut-pick','밤 줍는 자리','nature','🌰','uncommon',2,{observe:.26,record:.16},['허리가아프다','바구니','벌레먹은건버림']),
  twoD('winter-hand-warmer','손난로','thing','🔥','uncommon',2,{rest:.28,observe:.18},['주머니속','미지근','흔들면따뜻']),
  // 날씨 (3)
  twoD('wind-dust-devil-field','밭 회오리','nature','🌪️','rare',1,{wonder:.36,observe:.28},['짚이날린다','잠깐','사라짐']),
  twoD('rain-frog-out','비 오면 나오는 개구리','animal','🐸','uncommon',2,{observe:.30,wonder:.26},['길에','밟을뻔','신났나']),
  twoD('snow-quiet','눈 온 뒤 고요','nature','❄️','rare',1,{observe:.30,wonder:.36,rest:.22},['소리가없다','흡수한다','귀가먹먹']),
  // 시간대 (2)
  twoD('dawn-spider-web','새벽 거미줄 밭','nature','🕸️','rare',1,{observe:.34,wonder:.32,record:.26},['풀마다','이슬때문에','다보인다']),
  twoD('night-owl-call','밤 부엉이 소리','animal','🦉','rare',1,{observe:.28,wonder:.34},['어디선가','두번','대답이없다']),
  // 상황형 (3)
  twoD('cat-watching-fish','물고기 보는 고양이','animal','🐟','rare',1,{observe:.36,wonder:.30,record:.22},['발을담글까','안된다는걸안다','계속본다']),
  twoD('bird-stealing-food','먹이 훔치는 새','animal','🐦','rare',1,{observe:.32,wonder:.28,record:.20},['재빠르다','들켰다','도망']),
  twoD('dog-digging','땅 파는 개','animal','🐕','rare',1,{observe:.32,wonder:.26,record:.18},['흙이날린다','뭘묻나','열심']),
  // 이상하고 웃긴 것 (2)
  twoD('cat-in-window-box','창문 화분 속 고양이','animal','🪴','rare',1,{wonder:.40,observe:.30,record:.22},['꽃이눌림','주인은모른다','편해보인다']),
  twoD('umbrella-scarecrow-hand','우산 든 허수아비','thing','☂️','rare',1,{wonder:.38,observe:.26},['손이없는데','묶어놨다','비는안온다']),
  // 극희귀 (1)
  twoD('marten','담비','rare','🦫','rare',0,{wonder:.7,observe:.45,record:.4},['목이노랗다','나무를탄다','순식간에'],[],{rareEvent:true}),

  /* ---- batch 2 (526–550) ---- */
  // 일상·생활 (5)
  twoD('chimney-cap','굴뚝 모자','thing','🏠','common',3,{observe:.20,wonder:.12},['비막이','삐뚤','새가앉는다']),
  twoD('barrel-cut','반 자른 드럼통','thing','🛢️','common',3,{observe:.22},['화덕이됐다','그을림','뭘태웠나']),
  twoD('rice-husk-pile','왕겨 더미','thing','🌾','uncommon',2,{observe:.24,wonder:.14},['보드랍다','발이빠진다','태우면연기']),
  twoD('tarp-blue','파란 천막','thing','🟦','common',3,{observe:.18},['뭘덮었나','돌로눌러둠','바람에펄럭']),
  twoD('gate-chain','쇠사슬 문','thing','⛓️','common',3,{observe:.22,wonder:.14},['잠기지않음','걸쳐만둠','형식적']),
  // 자연·흔적 (5)
  twoD('pine-resin-scar','송진 흘린 자국','nature','🌲','uncommon',2,{observe:.28,wonder:.22},['상처에서','굳었다','향이난다']),
  twoD('cricket-hole','귀뚜라미 굴','nature','🦗','uncommon',2,{observe:.28,wonder:.24},['돌밑에','밤에운다','낮엔조용']),
  twoD('bird-mud-nest','흙 둥지','nature','🪹','rare',1,{observe:.32,wonder:.28,record:.20},['제비','처마에','한입씩날라']),
  twoD('worm-bird-pull','지렁이 당기는 새','animal','🪱','rare',1,{observe:.34,wonder:.30,record:.22},['버틴다','줄다리기','결국']),
  twoD('leaf-vein-eaten','잎맥만 남긴 벌레','nature','🐛','uncommon',2,{observe:.30,wonder:.26},['정교하다','뼈대는남김','왜']),
  // 계절 (4)
  twoD('spring-seed-line','씨 뿌린 줄','nature','🌱','uncommon',2,{observe:.26,record:.14},['자로잰듯','흙을덮음','기다림']),
  twoD('summer-hose-kids','물 뿌린 자국','thing','💦','uncommon',2,{observe:.24,wonder:.20},['젖었다','시원했겠다','금방마른다']),
  twoD('autumn-pepper-turn','고추 뒤집기','thing','🌶️','uncommon',2,{observe:.26,record:.14},['골고루','손으로','하루두번']),
  twoD('winter-frozen-pond','언 연못','nature','🧊','uncommon',2,{observe:.30,wonder:.26,record:.18},['금이갔다','밟으면안됨','속이보인다']),
  // 날씨 (2)
  twoD('rain-leak-bucket','비 새는 자리','thing','🪣','uncommon',2,{observe:.26,wonder:.18},['양동이를뒀다','똑똑','고쳐야한다']),
  twoD('wind-clothes-fly','날아간 빨래','thing','👕','rare',1,{wonder:.34,observe:.26},['울타리에','주인은모른다','흙묻음']),
  // 시간대 (3)
  twoD('dawn-mist-road','새벽 안개 길','nature','🌫️','uncommon',2,{observe:.30,wonder:.28},['앞이안보인다','천천히','소리가먼저']),
  twoD('noon-shadow-fence','정오 울타리 그림자','nature','☀️','uncommon',2,{observe:.28,record:.18},['줄무늬','바로아래','짧다']),
  twoD('night-moth-swarm-lamp','밤 벌레 소용돌이','animal','🦟','uncommon',2,{observe:.24,wonder:.26},['수십마리','같은자리','지치지않는다']),
  // 상황형 (2)
  twoD('cat-kitten-follow','따라가는 새끼들','animal','🐈','rare',1,{observe:.36,wonder:.34,record:.28},['셋이줄지어','어미뒤','뒤뚱']),
  twoD('bird-shadow-cat','고양이 피한 새','animal','🐦','rare',1,{observe:.32,wonder:.28},['날아올랐다','아슬아슬','가지위에서본다']),
  // 이상하고 웃긴 것 (3)
  twoD('scarecrow-mask','마스크 쓴 허수아비','thing','😷','rare',1,{wonder:.42,observe:.28},['왜','시절이그랬다','아직도']),
  twoD('cat-in-pot-lid','솥뚜껑 위 고양이','animal','🐈','rare',1,{wonder:.38,observe:.30,record:.20},['아직따뜻한가','동그랗게','안비킨다']),
  twoD('shoe-fence-row','울타리 신발들','thing','👟','rare',1,{wonder:.36,observe:.26},['하나씩꽂힘','전통인가','다다르다']),
  // 극희귀 (1)
  twoD('golden-eagle','검독수리','rare','🦅','rare',0,{wonder:.75,observe:.45,record:.4},['아주높이','원을그린다','작게보여도크다'],[],{rareEvent:true}),

  /* ---- batch 3 (551–575) ---- */
  // 일상·생활 (5)
  twoD('ladle-hanging','걸린 국자','thing','🥄','common',3,{observe:.22},['부엌벽','손잡이가길다','반질']),
  twoD('cutting-board-hang','매단 도마','thing','🔪','common',3,{observe:.22,record:.10},['물기말림','구멍에줄','칼자국']),
  twoD('spade-broken','부러진 삽자루','thing','🪏','uncommon',2,{observe:.24,wonder:.18},['힘을줬나','새로사야','그대로둠']),
  twoD('milk-crate-stack','포개둔 상자','thing','🥛','common',3,{observe:.20},['높이쌓음','파란색','의자로도']),
  twoD('kettle-outdoor-fire','모닥불 주전자','rest','🔥','rare',1,{rest:.30,observe:.26,wonder:.18},['삼발이위','끓는다','연기냄새']),
  // 자연·흔적 (5)
  twoD('tree-hole-owl','나무 구멍','nature','🕳️','uncommon',2,{observe:.30,wonder:.30},['깊다','뭐가살까','들여다본다']),
  twoD('feather-two','깃털 두 개','nature','🪶','uncommon',2,{observe:.26,wonder:.22},['나란히','같은새','싸웠나']),
  twoD('grass-tunnel-mouse','풀 속 길','nature','🐭','uncommon',2,{observe:.30,wonder:.28},['좁다','누가다닌다','작은터널']),
  twoD('bark-fungus-white','흰 나무버섯','nature','🍄','uncommon',2,{observe:.28,wonder:.22},['부채꼴','딱딱하다','죽은가지']),
  twoD('bird-drink-dew','이슬 마시는 새','animal','💧','rare',1,{observe:.32,wonder:.28,record:.20},['잎끝에서','한방울','고개를든다']),
  // 계절 (3)
  twoD('spring-plum-rain','매실 익는 비','nature','🌧️','uncommon',2,{observe:.26,wonder:.22},['장마전','열매가굵어진다','계속온다']),
  twoD('summer-cicada-loud','한여름 매미','animal','🪰','uncommon',2,{observe:.24,wonder:.24},['귀가아프다','정오에','일제히']),
  twoD('autumn-leaf-turn','물드는 잎','nature','🍁','uncommon',2,{observe:.32,record:.24,wonder:.16},['가장자리부터','하루가다르다','빨강']),
  // 날씨 (3)
  twoD('fog-tree-top','안개 위 나무','nature','🌲','rare',1,{observe:.30,wonder:.34,record:.22},['꼭대기만보인다','섬같다','아래는하얗다']),
  twoD('rain-umbrella-row','우산 행렬','thing','☂️','rare',1,{observe:.28,wonder:.24,record:.20},['색이제각각','줄지어','비오는날']),
  twoD('wind-grass-wave','풀 물결','nature','🌾','uncommon',2,{observe:.30,wonder:.26,record:.20},['바람이보인다','파도처럼','한참본다']),
  // 시간대 (2)
  twoD('dawn-rooster-two','새벽 닭 둘','animal','🐓','uncommon',2,{observe:.26,wonder:.22},['하나가울면','다른게','경쟁하듯']),
  twoD('night-frog-loud','밤 개구리','animal','🐸','uncommon',2,{observe:.24,wonder:.26},['논전체가','멈췄다','다시시작']),
  // 상황형 (3)
  twoD('cat-box-fight','상자 두고 다투는 고양이','animal','📦','rare',1,{wonder:.40,observe:.32,record:.22},['둘다들어가려','안맞는다','결국하나만']),
  twoD('bird-mirror-fight','창에 부딪는 새','animal','🪟','rare',1,{wonder:.38,observe:.30},['자기그림자','계속','말려야하나']),
  twoD('dog-cat-share-shade','그늘 나눠 쓰는 둘','animal','🌳','rare',1,{observe:.34,rest:.30,record:.24},['거리를둔다','더워서','휴전']),
  // 이상하고 웃긴 것 (3)
  twoD('cat-on-tv','TV 위 고양이','animal','📺','rare',1,{wonder:.38,observe:.30,record:.20},['따뜻해서','꼬리가가린다','안내려온다']),
  twoD('scarecrow-hat-gone','모자 없는 허수아비','thing','🎃','rare',1,{wonder:.34,observe:.24},['바람에날림','어디갔나','민머리']),
  twoD('boots-on-roof','지붕 위 장화','thing','🥾','rare',1,{wonder:.38,observe:.26},['어떻게','한짝만','비를맞는다']),
  // 극희귀 (1)
  twoD('musk-deer','사향노루','rare','🦌','rare',0,{wonder:.75,observe:.45,record:.4},['송곳니가보였다','작다','믿기지않는다'],[],{rareEvent:true}),

  /* ---- batch 4 (576–600) ---- */
  // 일상·생활 (5)
  twoD('rice-cake-stone','떡메 자리','thing','🍡','rare',1,{observe:.28,wonder:.22},['움푹','명절에만','묵직하다']),
  twoD('shoe-repair-kit','신발 수선 통','thing','👞','uncommon',2,{observe:.24,record:.12},['실과바늘','고쳐신는다','오래됨']),
  twoD('bamboo-fence-new','새 대울타리','thing','🎋','uncommon',2,{observe:.24,record:.12},['색이밝다','최근에','정성']),
  twoD('paper-window-patch','창호지 덧댐','thing','🪟','uncommon',2,{observe:.26,wonder:.18},['꽃잎을넣었다','구멍위에','예쁘게']),
  twoD('kettle-steam-out','김 나는 주전자','thing','🫖','uncommon',2,{observe:.26,rest:.16,wonder:.14},['다끓었다','아무도안온다','계속운다']),
  // 자연·흔적 (5)
  twoD('bird-mud-print','흙 위 새 발자국','nature','🐦','common',3,{observe:.24,wonder:.16},['가벼웠다','세갈래','여러마리']),
  twoD('spider-web-broken','찢어진 거미줄','nature','🕸️','uncommon',2,{observe:.26,wonder:.22},['누가지나갔나','다시짓는다','헛수고']),
  twoD('tree-graft','접붙인 나무','nature','🌳','rare',1,{observe:.30,wonder:.28,record:.20},['두나무가하나','묶어둠','붙었다']),
  twoD('bee-swarm-branch','벌 뭉치','animal','🐝','rare',1,{observe:.32,wonder:.36},['가지에주렁','수천마리','다가가지않는다']),
  twoD('bird-old-nest','작년 둥지','nature','🪹','uncommon',2,{observe:.28,wonder:.26},['비었다','겨울에보인다','다시올까']),
  // 계절 (4)
  twoD('spring-rice-seedling','모판','nature','🌱','uncommon',2,{observe:.28,record:.16},['연두색','줄맞춰','물이차있다']),
  twoD('summer-melon-net','참외 그물','thing','🍈','uncommon',2,{observe:.26,record:.14},['매달림','무게를견딘다','노랗다']),
  twoD('autumn-acorn-fall','떨어지는 도토리','nature','🌰','uncommon',2,{observe:.28,wonder:.24},['툭','머리에맞을뻔','계속떨어진다']),
  twoD('winter-tree-wrap-straw','짚 옷 입은 나무','nature','🎋','uncommon',2,{observe:.26,record:.16},['허리에','벌레가모인다','봄에태운다']),
  // 날씨 (2)
  twoD('rain-cat-run','비 피해 뛰는 고양이','animal','🐈','rare',1,{observe:.32,wonder:.26,record:.20},['젖기싫다','빠르다','처마밑으로']),
  twoD('snow-branch-bend','눈에 휜 가지','nature','❄️','uncommon',2,{observe:.28,wonder:.22},['부러질까','무겁다','털어줄까']),
  // 시간대 (3)
  twoD('dawn-first-bus','첫차 불빛','thing','🚌','rare',1,{observe:.26,wonder:.28},['멀리서','아직어둡다','기다린다']),
  twoD('noon-water-drink','한낮 물 한잔','rest','🥤','uncommon',2,{rest:.30,observe:.20},['벌컥','땀이식는다','살것같다']),
  twoD('night-cat-walk','밤 산책 고양이','animal','🐈','uncommon',2,{observe:.28,wonder:.26},['소리없이','자기길로','뒤안돌아봄']),
  // 상황형 (2)
  twoD('bird-cat-truce','같은 나무의 둘','animal','🌳','rare',1,{wonder:.38,observe:.32},['위아래로','서로안본다','알고있다']),
  twoD('dog-following-far','멀리서 따라오는 개','animal','🐕','rare',1,{observe:.32,wonder:.30,record:.20},['거리를둔다','멈추면앉는다','따라올까']),
  // 이상하고 웃긴 것 (2)
  twoD('cat-drawer','서랍 속 고양이','animal','🗄️','rare',1,{wonder:.42,observe:.30,record:.22},['열어놨더니','딱맞다','못닫는다']),
  twoD('umbrella-many-broken','버려진 우산들','thing','☂️','rare',1,{wonder:.34,observe:.26},['다부러짐','한자리에','태풍뒤']),
  // 극희귀 (2)
  twoD('flying-fish-river','튀어오른 물고기','rare','🐟','rare',0,{wonder:.7,observe:.45,record:.4},['은빛','물밖으로','한순간'],[],{rareEvent:true}),
  twoD('green-flash','초록 섬광','rare','🌅','rare',0,{wonder:.8,observe:.5,record:.45},['해가지는순간','초록','착각인줄알았다'],[],{rareEvent:true}),

  /* ===== BUILD 414-H — 오브젝트 601–700 =========================================
     ---- batch 1 (601–625) ---- */
  // 일상·생활 (5)
  twoD('rice-scale-old','저울추','thing','⚖️','uncommon',2,{observe:.24,wonder:.16},['쇳덩이','숫자가새겨짐','묵직']),
  twoD('wooden-spoon-set','나무 숟가락들','thing','🥄','common',3,{observe:.22,record:.10},['크기가다르다','통에꽂힘','닳았다']),
  twoD('sieve-rice','조리','thing','🍚','uncommon',2,{observe:.24,wonder:.14},['돌을골라냈다','대나무','이제안쓴다']),
  twoD('cloth-bundle','보따리','thing','🎁','uncommon',2,{observe:.26,wonder:.24},['묶어둠','뭐가들었나','매듭이단단']),
  twoD('rubber-hose-old','갈라진 호스','thing','🪢','common',3,{observe:.20},['물이샌다','테이프감음','아직쓴다']),
  // 자연·흔적 (5)
  twoD('bird-song-post','노래 자리','nature','🎵','uncommon',2,{observe:.28,wonder:.26},['늘같은가지','새벽마다','자기영역']),
  twoD('snail-shell-empty','빈 달팽이집','nature','🐌','uncommon',2,{observe:.26,wonder:.24},['나선이완벽','주인은없다','가볍다']),
  twoD('mole-mound-fresh','새 두더지 흙','nature','🕳️','uncommon',2,{observe:.28,wonder:.20},['아직젖음','오늘밤','또생겼다']),
  twoD('feather-down','솜털','nature','🪶','uncommon',2,{observe:.26,wonder:.24},['바람에','땅에안닿는다','따라가본다']),
  twoD('tree-hollow-water','썩은 구멍의 물','nature','💧','uncommon',2,{observe:.28,wonder:.26},['까맣다','모기가산다','깊어보인다']),
  // 계절 (4)
  twoD('spring-forsythia-wall','담장 개나리','nature','💛','uncommon',2,{observe:.32,record:.22},['노랗게흘러내림','제일먼저','줄기가늘어짐']),
  twoD('summer-shade-net-crop','차광막 아래','nature','🌱','uncommon',2,{observe:.24,record:.12},['빛이체로걸러짐','시원하다','줄무늬']),
  twoD('autumn-radish-dry','무말랭이','thing','🥬','uncommon',2,{observe:.26,record:.14},['채반위','쪼그라든다','볕이좋다']),
  twoD('winter-straw-boot','짚신','thing','👞','rare',1,{observe:.30,wonder:.26},['처마에','신을일없다','정교하다']),
  // 날씨 (3)
  twoD('rain-drip-line','처마 물줄기','thing','💧','uncommon',2,{observe:.28,wonder:.20},['일정하게','땅이패였다','오래된자국']),
  twoD('wind-dust-road','흙길 먼지','nature','🌬️','uncommon',2,{observe:.24,wonder:.18},['차가지나갔다','한참','가라앉는다']),
  twoD('fog-lamp-halo-double','안개 겹무리','thing','🌫️','rare',1,{observe:.30,wonder:.32},['빛이둘','착시','가까운데멀다']),
  // 시간대 (2)
  twoD('dawn-frost-grass','새벽 서리 풀','nature','❄️','uncommon',2,{observe:.30,record:.20},['하얗다','해뜨면','금방사라진다']),
  twoD('night-lamp-flicker','깜빡이는 가로등','thing','💡','uncommon',2,{observe:.26,wonder:.26},['수명이다됐다','불규칙','고쳐야하는데']),
  // 상황형 (3)
  twoD('cat-stalking','노리는 고양이','animal','🐈','rare',1,{observe:.36,wonder:.30,record:.22},['배를깔았다','한발씩','아직']),
  twoD('bird-alarm-call','경계하는 새','animal','🐦','rare',1,{observe:.32,wonder:.30},['시끄럽다','뭔가있다','다같이']),
  twoD('dog-sleeping-sun','볕에 자는 개','animal','🐕','uncommon',2,{observe:.30,rest:.32,record:.20},['배를보인다','완전히풀림','부럽다']),
  // 이상하고 웃긴 것 (2)
  twoD('cat-half-in-box','반만 들어간 고양이','animal','📦','rare',1,{wonder:.42,observe:.32,record:.22},['안맞는데','포기안한다','엉덩이가밖에']),
  twoD('scarecrow-modern','현대식 허수아비','thing','🎈','rare',1,{wonder:.38,observe:.26},['풍선','펄럭인다','효과는의문']),
  // 극희귀 (1)
  twoD('flying-snake','날다람쥐 활강','rare','🐿️','rare',0,{wonder:.75,observe:.45,record:.4},['막이펴졌다','미끄러진다','나무에서나무로'],[],{rareEvent:true}),

  /* ---- batch 2 (626–650) ---- */
  // 일상·생활 (5)
  twoD('brass-basin','놋대야','thing','🥣','uncommon',2,{observe:.26,record:.12},['광이난다','묵직','물이차갑다']),
  twoD('bamboo-pillow','죽부인','rest','🎋','rare',1,{rest:.34,observe:.24,wonder:.18},['여름밤','속이비었다','시원하다']),
  twoD('tin-roof-weight','지붕 누름돌','thing','🪨','common',3,{observe:.20,wonder:.14},['바람에날릴까','줄지어','오래됨']),
  twoD('rice-paddle','밥주걱','thing','🍚','common',3,{observe:.20},['나무','밥알이붙음','걸어둠']),
  twoD('coal-scuttle','연탄 집게통','thing','⚫','uncommon',2,{observe:.22,wonder:.12},['까맣다','옆에재','겨울준비']),
  // 자연·흔적 (5)
  twoD('bird-bath-puddle-cat','고양이 발 웅덩이','nature','🐾','uncommon',2,{observe:.26,wonder:.20},['물을밟았다','자국이번짐','금방마른다']),
  twoD('leaf-cut-bee','잎 자른 벌','nature','🍃','rare',1,{observe:.32,wonder:.32,record:.20},['동그랗게','오려갔다','집을짓나']),
  twoD('bark-lichen-ring','고리 지의류','nature','🪨','uncommon',2,{observe:.28,wonder:.22},['동심원','수십년','아주느리게']),
  twoD('bird-egg-broken-fall','떨어진 알','nature','🥚','rare',1,{observe:.30,wonder:.32},['깨졌다','둥지가높다','안타깝다']),
  twoD('web-dew-heavy','이슬 무거운 거미줄','nature','💧','uncommon',2,{observe:.32,record:.22,wonder:.18},['처졌다','구슬같다','곧마른다']),
  // 계절 (4)
  twoD('spring-tadpole-swarm','올챙이 떼','animal','🐸','uncommon',2,{observe:.32,wonder:.26,record:.18},['까맣게','한덩어리','움직인다']),
  twoD('summer-awning-shade','차양 그늘','rest','⛱️','uncommon',2,{rest:.30,observe:.20},['가게앞','딱그만큼','줄이생긴다']),
  twoD('autumn-persimmon-peel','감 껍질','thing','🍊','uncommon',2,{observe:.26,record:.14},['나선으로','한번에깎음','솜씨']),
  twoD('winter-window-frost-flower','유리 성에꽃','nature','❄️','rare',1,{observe:.34,wonder:.30,record:.24},['양치식물같다','저절로','손대면진다']),
  // 날씨 (2)
  twoD('rain-boots-splash','장화로 첨벙','thing','💦','rare',1,{wonder:.34,observe:.26},['일부러밟았다','물이튄다','재밌다']),
  twoD('snow-roof-slide','미끄러진 지붕 눈','nature','⛄','uncommon',2,{observe:.26,wonder:.22},['쿵','한꺼번에','놀랐다']),
  // 시간대 (3)
  twoD('dawn-bird-line-wire','새벽 전선 새들','animal','🐦','uncommon',2,{observe:.28,wonder:.24,record:.18},['아직안난다','줄지어','해를기다린다']),
  twoD('noon-well-shadow','우물 속 그림자','nature','🕳️','rare',1,{observe:.30,wonder:.34},['내얼굴','까맣다','깊다']),
  twoD('night-tv-blue-many','밤 창들의 파란빛','thing','📺','uncommon',2,{observe:.26,wonder:.26},['같은시간','같은색','다들본다']),
  // 상황형 (2)
  twoD('cat-jump-fence','담 넘는 고양이','animal','🐈','rare',1,{observe:.34,wonder:.28,record:.22},['한번에','소리없이','뒷다리가']),
  twoD('bird-worm-tug','벌레 당기는 새','animal','🐦','rare',1,{observe:.32,wonder:.26,record:.20},['잘안나온다','발을디딘다','끈질기다']),
  // 이상하고 웃긴 것 (3)
  twoD('cat-in-sink-bowl','대야 속 고양이','animal','🥣','rare',1,{wonder:.40,observe:.30,record:.20},['왜','딱맞는다','물은없다']),
  twoD('umbrella-pot-lid','냄비뚜껑 우산','thing','🥘','rare',1,{wonder:.40,observe:.26},['급했나','비는막는다','창의적']),
  twoD('boots-scarecrow-feet','장화 신은 허수아비','thing','🥾','rare',1,{wonder:.36,observe:.24},['발이없는데','정성','진흙때문인가']),
  // 극희귀 (1)
  twoD('otter-family','수달 가족','rare','🦦','rare',0,{wonder:.8,observe:.5,record:.45},['셋이었다','미끄럼탄다','한참봤다'],[],{rareEvent:true}),

  /* ---- batch 3 (651–675) ---- */
  // 일상·생활 (5)
  twoD('clay-jar-broken','깨진 항아리','thing','🏺','uncommon',2,{observe:.26,wonder:.22},['조각이남음','오래된','속에풀이']),
  twoD('wire-hanger-bent','휜 옷걸이','thing','🪝','common',3,{observe:.20,wonder:.14},['모양이망가짐','뭘걸었나','철사']),
  twoD('bucket-hole','구멍 난 양동이','thing','🪣','common',3,{observe:.22,wonder:.16},['물이샌다','화분이됐다','재활용']),
  twoD('doorstep-stone','댓돌','rest','🪨','uncommon',2,{observe:.26,rest:.14},['닳아반질','신발을벗던','수십년']),
  twoD('lamp-shade-paper','종이 갓','thing','💡','uncommon',2,{observe:.24,wonder:.18},['누렇게','빛이부드럽다','찢어짐']),
  // 자연·흔적 (5)
  twoD('ant-lion-pit','개미귀신 함정','nature','🕳️','rare',1,{observe:.34,wonder:.36},['깔때기','모래속','기다린다']),
  twoD('bird-nest-fallen-tree','나무 밑 둥지','nature','🪹','rare',1,{observe:.30,wonder:.28},['통째로떨어짐','새끼는없다','다행인가']),
  twoD('mushroom-fairy-ring','버섯 고리','nature','🍄','rare',1,{observe:.34,wonder:.36,record:.24},['동그랗게','왜','신기하다']),
  twoD('snake-track-sand','뱀 지나간 자국','nature','🐍','rare',1,{observe:.32,wonder:.34},['S자','방금','어디로갔나']),
  twoD('tree-root-rock','바위 쥔 뿌리','nature','🪨','rare',1,{observe:.32,wonder:.30,record:.20},['감싸안았다','수십년','돌이진다']),
  // 계절 (3)
  twoD('spring-bee-first','첫 벌','animal','🐝','uncommon',2,{observe:.30,wonder:.28},['꽃을찾는다','아직춥다','부지런']),
  twoD('summer-dog-water','물 마시는 개','animal','🐕','uncommon',2,{observe:.28,rest:.20},['혀로','시끄럽다','한참']),
  twoD('winter-bird-puffed','부푼 새','animal','🐦','uncommon',2,{observe:.32,wonder:.26,record:.20},['동그랗다','추워서','두배로']),
  // 날씨 (3)
  twoD('rain-spider-hide','비 피한 거미','animal','🕷️','uncommon',2,{observe:.28,wonder:.24},['잎아래','줄은젖었다','기다린다']),
  twoD('wind-hat-fly','날아가는 모자','thing','🎩','rare',1,{wonder:.36,observe:.26},['쫓아간다','또굴러간다','포기']),
  twoD('snow-cat-print','눈 위 고양이 발자국','nature','🐾','uncommon',2,{observe:.30,wonder:.24,record:.18},['일자로','어디로','아직선명']),
  // 시간대 (2)
  twoD('dawn-smoke-first','첫 연기','thing','💨','uncommon',2,{observe:.26,wonder:.24},['한집에서만','아직어둡다','밥짓나']),
  twoD('night-window-open','열린 창','thing','🪟','uncommon',2,{observe:.26,wonder:.26,rest:.16},['커튼이흔들','더운밤','소리가난다']),
  // 상황형 (3)
  twoD('cat-sleeping-pile','겹쳐 자는 고양이들','animal','🐈','rare',1,{observe:.36,rest:.32,record:.28},['누가누군지','따뜻하겠다','안깬다']),
  twoD('bird-bathing-splash','물 튀기는 새','animal','💦','rare',1,{observe:.34,wonder:.28,record:.24},['신났다','물이사방으로','금방간다']),
  twoD('dog-barking-nothing','허공에 짖는 개','animal','🐕','rare',1,{wonder:.36,observe:.28},['아무것도없다','뭘본걸까','계속']),
  // 이상하고 웃긴 것 (3)
  twoD('cat-on-keyboard','자판 위 고양이','animal','⌨️','rare',1,{wonder:.42,observe:.30,record:.20},['하필','일을못한다','기분좋아보인다']),
  twoD('scarecrow-fallen','넘어진 허수아비','thing','🎃','rare',1,{wonder:.36,observe:.26},['누워있다','새들이앉았다','완전히졌다']),
  twoD('umbrella-in-tree-stuck','나무에 낀 우산','thing','☂️','rare',1,{wonder:.34,observe:.24},['접힌채','높다','몇달째']),
  // 극희귀 (1)
  twoD('leopard-cat-kitten','삵 새끼','rare','🐈','rare',0,{wonder:.8,observe:.5,record:.45},['혼자였다','어미는어디','움직이지못했다'],[],{rareEvent:true}),

  /* ---- batch 4 (676–700) ---- */
  // 일상·생활 (5)
  twoD('scissors-rusted','녹슨 가위','thing','✂️','common',3,{observe:.22,wonder:.14},['안벌어진다','벽에걸림','언제부터']),
  twoD('cup-broken-handle','손잡이 깨진 컵','thing','☕','common',3,{observe:.22,wonder:.18},['그래도쓴다','붓통이됨','정들었나']),
  twoD('wooden-crate-old','낡은 나무 상자','thing','📦','common',3,{observe:.20},['글씨가지워짐','뭘담았나','튼튼하다']),
  twoD('rope-knot-old','오래된 매듭','thing','🪢','uncommon',2,{observe:.24,wonder:.20},['풀리지않는다','누가묶었나','단단하다']),
  twoD('metal-sign-rust','녹슨 표지판','thing','🪧','uncommon',2,{observe:.24,wonder:.20},['글씨가안보인다','기울어짐','뭘알렸을까']),
  // 자연·흔적 (5)
  twoD('bird-drop-seed','새가 떨군 씨','nature','🌱','uncommon',2,{observe:.28,wonder:.28},['엉뚱한곳에','싹이났다','여행했다']),
  twoD('bug-shell-clear','투명한 허물','nature','🪲','rare',1,{observe:.30,wonder:.30},['속이비친다','완벽하다','바스러진다']),
  twoD('moss-tree-north','나무 북쪽 이끼','nature','🧭','uncommon',2,{observe:.28,wonder:.24},['한쪽만','길잡이','축축']),
  twoD('bird-feather-water','물에 뜬 깃털','nature','🪶','uncommon',2,{observe:.28,wonder:.26,record:.18},['빙글','안가라앉는다','천천히']),
  twoD('spider-hunting','사냥하는 거미','animal','🕷️','rare',1,{observe:.32,wonder:.32},['줄없이','뛰어든다','빠르다']),
  // 계절 (4)
  twoD('spring-seed-hand','씨 뿌리는 손','thing','🌱','uncommon',2,{observe:.28,record:.16},['흩뿌린다','골고루','오래한솜씨']),
  twoD('summer-fan-hand','부채질','rest','🪭','uncommon',2,{rest:.30,observe:.20},['느리게','팔이아프다','바람이온다']),
  twoD('autumn-leaf-burn','낙엽 태우는 연기','thing','🍂','rare',1,{observe:.28,wonder:.26,record:.18},['냄새가난다','매캐하다','가을이다']),
  twoD('winter-boiler-warm','따뜻한 벽','thing','🏠','uncommon',2,{observe:.24,rest:.26,wonder:.16},['손을댄다','따뜻하다','고양이가안다']),
  // 날씨 (2)
  twoD('rain-window-inside','창 안에서 보는 비','rest','🌧️','uncommon',2,{rest:.30,observe:.26,wonder:.20},['나갈일없다','소리가좋다','계속본다']),
  twoD('wind-laundry-dance','춤추는 빨래','thing','👕','uncommon',2,{observe:.28,wonder:.24,record:.18},['부풀었다','사람같다','펄럭']),
  // 시간대 (3)
  twoD('dawn-well-water','새벽 우물물','thing','🪣','uncommon',2,{observe:.26,wonder:.22},['제일차갑다','안개가','아무도없다']),
  twoD('noon-cat-shadow','정오 고양이 그림자','animal','🐈','uncommon',2,{observe:.28,wonder:.22},['자기밑에','짧다','안움직인다']),
  twoD('night-star-cold','겨울 밤하늘','nature','✨','rare',1,{observe:.34,wonder:.38,record:.28},['너무많다','추울수록','목이아프다']),
  // 상황형 (2)
  twoD('cat-in-tree-watching','나무 위에서 보는 고양이','animal','🌳','rare',1,{observe:.34,wonder:.30,record:.22},['내려다본다','안내려온다','편한가보다']),
  twoD('bird-nest-guard','둥지 지키는 새','animal','🪹','rare',1,{observe:.34,wonder:.32},['안비킨다','노려본다','가까이가면']),
  // 이상하고 웃긴 것 (2)
  twoD('cat-tail-fence-gap','틈에 낀 꼬리','animal','🐈','rare',1,{wonder:.42,observe:.30},['몸은저쪽','꼬리만이쪽','본인은모른다']),
  twoD('scarecrow-birds-many','새 앉은 허수아비','thing','🎃','rare',1,{wonder:.44,observe:.30,record:.24},['다섯마리','완전히실패','편해보인다']),
  // 극희귀 (2)
  twoD('white-deer','흰 사슴','rare','🦌','rare',0,{wonder:.8,observe:.5,record:.45},['하얗다','한참서있었다','꿈같았다'],[],{rareEvent:true}),
  twoD('noctilucent-cloud','야광운','rare','🌌','rare',0,{wonder:.8,observe:.5,record:.45},['밤인데구름이빛난다','은빛','아주높은곳'],[],{rareEvent:true}),

  /* ===== BUILD 414-I — 오브젝트 701–800 =========================================
     ---- batch 1 (701–725) ---- */
  // 일상·생활 (5)
  twoD('thermos-old','낡은 보온병','thing','🍵','common',3,{observe:.22,rest:.12},['꽃무늬','아직따뜻','뚜껑이컵']),
  twoD('radio-antenna','라디오 안테나','thing','📻','common',3,{observe:.22,wonder:.16},['길게뽑음','각도를맞춘다','지지직']),
  twoD('sewing-thimble','골무','thing','🧵','uncommon',2,{observe:.26,wonder:.18},['작다','은색','오래썼다']),
  twoD('rice-sack-chair','쌀포대 방석','rest','🌾','uncommon',2,{rest:.30,observe:.18},['접어서','앉기좋다','임시로']),
  twoD('nail-in-post','기둥의 못','thing','🔩','common',3,{observe:.22,wonder:.18},['뭘걸었나','지금은비었다','녹슬었다']),
  // 자연·흔적 (5)
  twoD('bird-scratch-post','새 발톱 자국','nature','🐦','uncommon',2,{observe:.26,wonder:.20},['같은자리','수없이','반질해짐']),
  twoD('tree-lightning-split','벼락 자국','nature','⚡','rare',1,{observe:.32,wonder:.34},['세로로','그날','살아있다']),
  twoD('worm-trail-sand','지렁이 지나간 길','nature','🪱','uncommon',2,{observe:.26,wonder:.20},['구불구불','밤사이','흙이좋다']),
  twoD('bird-feather-red','붉은 깃털','nature','🪶','rare',1,{observe:.32,wonder:.32,record:.22},['처음보는색','무슨새','주울까']),
  twoD('spider-egg-hatch','깨어난 알집','nature','🕷️','rare',1,{observe:.32,wonder:.36},['수백마리','흩어진다','작다']),
  // 계절 (4)
  twoD('spring-magnolia','목련','nature','🌸','uncommon',2,{observe:.32,record:.22},['잎보다먼저','크고희다','금방진다']),
  twoD('summer-well-jar','우물 옆 항아리','thing','🏺','uncommon',2,{observe:.26,rest:.14},['물을받아둠','이끼가꼈다','서늘하다']),
  twoD('autumn-rice-bag-full','가득 찬 쌀자루','thing','🌾','uncommon',2,{observe:.26,record:.16},['묵직','한해가끝났다','뿌듯']),
  twoD('winter-ice-bucket','언 양동이','thing','🧊','uncommon',2,{observe:.26,wonder:.20},['물이통째로','안빠진다','거꾸로들어도']),
  // 날씨 (3)
  twoD('rain-tree-drip','비 그친 나무','nature','🌳','uncommon',2,{observe:.28,wonder:.22},['아직떨어진다','흔들면','한번더']),
  twoD('wind-seed-storm','씨앗 폭풍','nature','🌾','rare',1,{observe:.30,wonder:.32,record:.20},['하얗게','눈같다','민들레']),
  twoD('fog-morning-thick','짙은 아침 안개','nature','🌫️','uncommon',2,{observe:.28,wonder:.30},['손이안보인다','소리가죽는다','조심']),
  // 시간대 (2)
  twoD('dawn-kettle-boil','새벽 끓는 물','thing','🫖','uncommon',2,{observe:.26,rest:.16},['아직깜깜','소리만','곧차한잔']),
  twoD('night-fridge-hum','밤 냉장고 소리','thing','🧊','uncommon',2,{observe:.22,wonder:.24},['이제야들린다','조용해서','계속돈다']),
  // 상황형 (3)
  twoD('cat-yawn','하품하는 고양이','animal','🐈','rare',1,{observe:.34,wonder:.26,record:.22},['입이크다','이빨이보인다','따라하게된다']),
  twoD('bird-two-branch','가지 위 두 마리','animal','🐦','rare',1,{observe:.32,wonder:.28,record:.22},['거리가일정','같은방향','부부인가']),
  twoD('dog-rolling-grass','풀에 뒹구는 개','animal','🐕','rare',1,{wonder:.36,observe:.30,record:.22},['등을비빈다','네발이하늘로','행복해보인다']),
  // 이상하고 웃긴 것 (2)
  twoD('cat-under-blanket','이불 속 혹','animal','🛏️','rare',1,{wonder:.42,observe:.30},['움직인다','모른척','들켰다']),
  twoD('shoe-planter-row','신발 화분 줄','thing','👟','rare',1,{wonder:.36,observe:.26,record:.18},['다섯짝','짝이없다','꽃이핀다']),
  // 극희귀 (1)
  twoD('golden-frog','금개구리','rare','🐸','rare',0,{wonder:.75,observe:.5,record:.45},['등이금빛','아주드물다','천천히사라졌다'],[],{rareEvent:true}),

  /* ---- batch 2 (726–750) ---- */
  // 일상·생활 (5)
  twoD('lunchbox-tin','양은 도시락','thing','🍱','uncommon',2,{observe:.26,wonder:.20},['찌그러짐','난로에올렸다','뚜껑이안맞는다']),
  twoD('ink-pen-old','만년필','thing','🖋️','rare',1,{observe:.28,wonder:.24,record:.16},['잉크가말랐다','뚜껑이없다','누가썼을까']),
  twoD('button-lost','떨어진 단추','thing','🔘','common',3,{observe:.24,wonder:.20},['하나','실이남음','주인은모른다']),
  twoD('comb-broken','이 빠진 빗','thing','💇','common',3,{observe:.22,wonder:.16},['그래도쓴다','플라스틱','창턱에']),
  twoD('key-hook-empty','빈 열쇠고리','thing','🔑','common',3,{observe:.22,wonder:.18},['다들나갔다','흔들린다','현관']),
  // 자연·흔적 (5)
  twoD('tree-woodpecker-line','딱따구리 줄구멍','nature','🪵','uncommon',2,{observe:.30,wonder:.26},['가로로','일정하게','수액을먹나']),
  twoD('leaf-two-color','반만 물든 잎','nature','🍁','uncommon',2,{observe:.32,record:.22,wonder:.18},['경계가선명','한잎에두계절','신기하다']),
  twoD('ant-carrying-wing','날개 나르는 개미','animal','🐜','rare',1,{observe:.32,wonder:.32},['자기보다크다','비틀거린다','포기안한다']),
  twoD('bird-print-snow-end','끊긴 발자국','nature','🐦','rare',1,{observe:.34,wonder:.38,record:.24},['갑자기없다','날아갔다','그자리에서']),
  twoD('mushroom-tiny','아주 작은 버섯','nature','🍄','uncommon',2,{observe:.32,record:.20},['쪼그려야보인다','우산같다','밟을뻔']),
  // 계절 (4)
  twoD('spring-frog-egg-hatch','깨어나는 알','animal','🐸','rare',1,{observe:.34,wonder:.32,record:.22},['꼬물','알이비어간다','시작']),
  twoD('summer-melon-cut','자른 참외','thing','🍈','uncommon',2,{observe:.28,rest:.16},['시원하다','씨를긁어냄','손이끈적']),
  twoD('autumn-web-gold','노을 거미줄','nature','🕸️','rare',1,{observe:.34,wonder:.34,record:.26},['금빛','역광에서만','한순간']),
  twoD('winter-snow-shovel-path','치운 눈길','nature','⛄','uncommon',2,{observe:.26,wonder:.18},['한사람폭','누가먼저','고맙다']),
  // 날씨 (2)
  twoD('rain-ant-move','비 전 개미 이사','animal','🐜','rare',1,{observe:.32,wonder:.34},['줄지어','알을옮긴다','비가온다는뜻']),
  twoD('wind-tree-seed-rain','씨앗 비','nature','🌰','uncommon',2,{observe:.28,wonder:.26},['후두둑','바람불면','머리에']),
  // 시간대 (3)
  twoD('dawn-color-east','동쪽 하늘색','nature','🌅','rare',1,{observe:.34,wonder:.34,record:.26},['보라에서주황','몇분만','매일다르다']),
  twoD('noon-bee-busy','한낮 벌','animal','🐝','uncommon',2,{observe:.28,wonder:.22},['제일바쁘다','꽃마다','소리가난다']),
  twoD('night-dog-far','멀리서 개 짖는 소리','animal','🐕','uncommon',2,{observe:.24,wonder:.28},['한마리가시작','다른마을도','릴레이']),
  // 상황형 (2)
  twoD('cat-cleaning-kitten','새끼 핥는 어미','animal','🐈','rare',1,{observe:.36,wonder:.32,record:.28},['꼼짝못한다','싫어하는듯','계속']),
  twoD('bird-dust-two','같이 목욕하는 새','animal','🐦','rare',1,{observe:.34,wonder:.30,record:.24},['둘이서','흙먼지','자리싸움']),
  // 이상하고 웃긴 것 (3)
  twoD('cat-stuck-fence','울타리 낀 고양이','animal','🐈','rare',1,{wonder:.42,observe:.30},['머리는통과','몸이안된다','후회중']),
  twoD('scarecrow-umbrella-broken','부러진 우산 허수아비','thing','☂️','rare',1,{wonder:.38,observe:.26},['뼈대만','더무섭다','효과있을듯']),
  twoD('shoe-single-tree','나무 밑 신발 한 짝','thing','👞','rare',1,{wonder:.34,observe:.24},['또한짝','같은신발일까','아무도안찾는다']),
  // 극희귀 (1)
  twoD('siberian-tiger-print','큰 발자국','rare','🐾','rare',0,{wonder:.85,observe:.5,record:.45},['너무크다','있을리없는데','뒤를돌아봤다'],[],{rareEvent:true}),

  /* ---- batch 3 (751–775) ---- */
  // 일상·생활 (5)
  twoD('glass-jar-coins','동전 병','thing','🪙','uncommon',2,{observe:.26,wonder:.20},['가득','언제부터','묵직하다']),
  twoD('shoe-polish-tin','구두약','thing','👞','common',3,{observe:.22},['말랐다','까맣다','안쓴지오래']),
  twoD('clock-stopped','멈춘 시계','thing','🕰️','rare',1,{observe:.30,wonder:.30,record:.18},['몇시에멈췄나','건전지','아무도안고침']),
  twoD('picture-frame-empty','빈 액자','thing','🖼️','rare',1,{observe:.28,wonder:.32},['사진이없다','뗐나','자국만남음']),
  twoD('spoon-bent','휜 숟가락','thing','🥄','common',3,{observe:.22,wonder:.16},['뭘팠나','안펴진다','그대로쓴다']),
  // 자연·흔적 (5)
  twoD('tree-ring-cut','나이테','nature','🪵','rare',1,{observe:.34,wonder:.32,record:.24},['세어본다','좁은해가있다','오래살았다']),
  twoD('bird-eggshell-blue-nest','둥지의 파란 알','nature','🥚','rare',1,{observe:.34,wonder:.34,record:.26},['셋','만지면안된다','어미가본다']),
  twoD('snail-two','달팽이 둘','animal','🐌','rare',1,{observe:.30,wonder:.28},['같은방향','천천히','경주는아니다']),
  twoD('web-in-window','창틀 거미줄','nature','🕸️','common',3,{observe:.24,wonder:.20},['구석에','안치운다','주인은숨음']),
  twoD('root-crack-wall','벽 뚫은 뿌리','nature','🌿','uncommon',2,{observe:.30,wonder:.28},['시멘트를','천천히','이긴다']),
  // 계절 (3)
  twoD('spring-swallow-return','돌아온 제비','animal','🐦','rare',1,{observe:.32,wonder:.34,record:.24},['작년그자리','기억한다','봄이다']),
  twoD('summer-ice-melt','녹는 얼음','thing','🧊','uncommon',2,{observe:.26,wonder:.22},['금방','물이고인다','아까웠다']),
  twoD('autumn-last-leaf','마지막 잎','nature','🍂','rare',1,{observe:.32,wonder:.36,record:.26},['하나만','안떨어진다','버틴다']),
  // 날씨 (3)
  twoD('rain-first-drop','첫 빗방울','nature','💧','uncommon',2,{observe:.30,wonder:.28},['하나','땅에자국','곧온다']),
  twoD('wind-door-slam','바람에 닫힌 문','thing','🚪','uncommon',2,{observe:.24,wonder:.24},['쾅','놀랐다','아무도없다']),
  twoD('fog-sun-disk','안개 속 해','nature','☀️','rare',1,{observe:.32,wonder:.34,record:.24},['맨눈으로본다','동그랗다','하얗다']),
  // 시간대 (2)
  twoD('dawn-shadow-none','그림자 없는 시간','nature','🌫️','rare',1,{observe:.30,wonder:.36},['해가아직','평평하다','묘하다']),
  twoD('night-moon-cloud','구름 지나는 달','nature','🌙','uncommon',2,{observe:.30,wonder:.30,record:.20},['가렸다','다시나온다','계속본다']),
  // 상황형 (3)
  twoD('cat-tail-water','물에 꼬리 담근 고양이','animal','🐈','rare',1,{wonder:.40,observe:.30},['실수였다','굳었다','못본척']),
  twoD('bird-hitting-glass-stop','창 앞에 멈춘 새','animal','🪟','rare',1,{observe:.34,wonder:.32},['알아챘다','방향을튼다','다행']),
  twoD('dog-ear-one-up','한쪽 귀만 선 개','animal','🐕','rare',1,{wonder:.38,observe:.30,record:.22},['들었나','고개가기운다','귀엽다']),
  // 이상하고 웃긴 것 (2)
  twoD('cat-in-hat-box','모자 상자 속 고양이','animal','🎩','rare',1,{wonder:.42,observe:.30,record:.22},['모자는어디','딱맞는다','뚜껑을못덮는다']),
  twoD('scarecrow-selfie','허수아비와 나란히','thing','🎃','rare',1,{wonder:.40,observe:.28},['둘다서있다','누가진짜','정지']),
  twoD('mirror-cat-behind','거울 뒤 확인하는 고양이','animal','🪞','rare',1,{wonder:.44,observe:.32,record:.22},['뒤에도있나','돌아가본다','없다']),
  // 극희귀 (1)
  twoD('rainbow-full-arc','완전한 무지개','rare','🌈','rare',0,{wonder:.8,observe:.5,record:.5},['끝에서끝까지','다보인다','차를세웠다'],[],{rareEvent:true}),

  /* ---- batch 4 (776–800) ---- */
  // 일상·생활 (5)
  twoD('bucket-well-rope','두레박 줄','thing','🪢','uncommon',2,{observe:.24,wonder:.20},['길다','손이아프다','아직쓴다']),
  twoD('flour-sack','밀가루 포대','thing','🍞','common',3,{observe:.20},['하얗게','자국이남음','반쯤']),
  twoD('washing-line-pole','빨래 받침대','thing','👕','common',3,{observe:.22},['Y자','줄을올린다','나무']),
  twoD('lamp-cord-long','늘어진 전선','thing','💡','common',3,{observe:.20,wonder:.16},['위험해보인다','임시로','오래됐다']),
  twoD('kettle-two','주전자 둘','thing','🫖','uncommon',2,{observe:.24,rest:.12},['크기가다르다','나란히','하나만쓴다']),
  // 자연·흔적 (5)
  twoD('bird-bone-tiny','아주 작은 뼈','nature','🦴','rare',1,{observe:.30,wonder:.32},['새끼였나','가볍다','묻어줄까']),
  twoD('leaf-hole-perfect','완벽한 구멍','nature','🍃','uncommon',2,{observe:.30,wonder:.28},['동그랗다','누가','자로잰듯']),
  twoD('spider-silk-line','한 줄 거미줄','nature','🕸️','uncommon',2,{observe:.30,wonder:.30},['어디서어디로','건너갔다','보이지않는다']),
  twoD('ant-hill-big','큰 개미집','nature','🐜','uncommon',2,{observe:.30,wonder:.26},['도시같다','수천마리','밟지않는다']),
  twoD('tree-fork-nest','갈래에 낀 것','nature','🌳','uncommon',2,{observe:.28,wonder:.30},['홍수때','여기까지','물이높았다']),
  // 계절 (4)
  twoD('spring-plow-bird','쟁기 뒤 새떼','animal','🐦','rare',1,{observe:.34,wonder:.30,record:.24},['벌레가나온다','따라다닌다','영리하다']),
  twoD('summer-shade-cat-move','그늘 따라간 고양이','animal','🐈','rare',1,{observe:.32,wonder:.28},['해가돌면','자리를옮긴다','계산이빠르다']),
  twoD('autumn-scarecrow-done','일 끝낸 허수아비','thing','🎃','uncommon',2,{observe:.26,wonder:.24},['논이비었다','혼자','내년까지']),
  twoD('winter-bird-few','겨울 남은 새','animal','🐦','uncommon',2,{observe:.30,wonder:.28},['다갔는데','안갔다','왜']),
  // 날씨 (2)
  twoD('rain-roof-song','지붕 빗소리','thing','🌧️','uncommon',2,{observe:.24,rest:.24,wonder:.20},['리듬이있다','졸린다','계속']),
  twoD('snow-tree-quiet','눈 쌓인 나무','nature','❄️','uncommon',2,{observe:.30,record:.22,wonder:.20},['가지마다','고요하다','건드리면']),
  // 시간대 (3)
  twoD('dawn-window-light','새벽 첫 불빛','thing','🪟','uncommon',2,{observe:.26,wonder:.26},['한집만','부지런하다','부럽지않다']),
  twoD('noon-nap-everyone','다들 자는 시간','rest','😴','rare',1,{rest:.36,observe:.22,wonder:.20},['아무도없다','너무덥다','조용']),
  twoD('night-owl-shape','밤 부엉이 실루엣','animal','🦉','rare',1,{observe:.32,wonder:.36,record:.24},['가지위','움직이지않는다','눈만']),
  // 상황형 (2)
  twoD('cat-bird-window','창 사이 고양이와 새','animal','🪟','rare',1,{wonder:.40,observe:.34,record:.24},['유리가있다','둘다안다','안전하다']),
  twoD('dog-cat-nose','코 맞댄 개와 고양이','animal','🐕','rare',1,{observe:.36,wonder:.34,record:.28},['인사인가','조심스럽다','오래알았나']),
  // 이상하고 웃긴 것 (2)
  twoD('cat-fits-anywhere','좁은 곳의 고양이','animal','🐈','rare',1,{wonder:.44,observe:.32,record:.22},['어떻게','액체같다','편해보인다']),
  twoD('scarecrow-cat-throne','허수아비 왕좌','animal','🐈','rare',1,{wonder:.46,observe:.32,record:.26},['머리위에','완전히점령','새는옆에']),
  // 극희귀 (2)
  twoD('meteor-slow','느린 유성','rare','☄️','rare',0,{wonder:.8,observe:.5,record:.45},['오래탄다','초록으로','조각났다'],[],{rareEvent:true}),
  twoD('bird-albino','흰 까치','rare','🐦','rare',0,{wonder:.8,observe:.5,record:.45},['까치인데하얗다','길조라고','한참봤다'],[],{rareEvent:true}),

  /* ===== BUILD 414-J — 오브젝트 801–900 =========================================
     ---- batch 1 (801–825) ---- */
  // 일상·생활 (5)
  twoD('kettle-lid-lost','뚜껑 없는 주전자','thing','🫖','common',3,{observe:.22,wonder:.16},['접시로덮음','임시가영구','물은끓는다']),
  twoD('stool-three-leg','다리 셋 의자','rest','🪑','uncommon',2,{rest:.30,observe:.20},['흔들린다','앉을수는있다','균형']),
  twoD('bowl-chipped','이 빠진 사발','thing','🥣','common',3,{observe:.22,wonder:.16},['입술이닿는곳','피해서','아직쓴다']),
  twoD('rope-clothesline-sag','늘어진 빨래줄','thing','🪢','common',3,{observe:.20,wonder:.14},['가운데가처짐','받침대를뒀다','오래됐다']),
  twoD('window-stick','창 받침 막대','thing','🪟','uncommon',2,{observe:.24,wonder:.18},['이만큼만열림','나무토막','딱맞다']),
  // 자연·흔적 (5)
  twoD('bird-nest-in-pipe','관 속 둥지','nature','🪹','rare',1,{observe:.32,wonder:.30},['배기구에','따뜻한가','매년']),
  twoD('leaf-print-cement','시멘트에 찍힌 잎','nature','🍃','rare',1,{observe:.32,wonder:.34,record:.24},['영원히','그날떨어졌다','잎맥까지']),
  twoD('mushroom-under-leaf','잎 밑 버섯','nature','🍄','uncommon',2,{observe:.30,record:.18},['들춰야보인다','숨었다','작다']),
  twoD('bird-track-cross','엇갈린 발자국','nature','🐦','uncommon',2,{observe:.28,wonder:.26},['둘이만났나','겹친다','언제']),
  twoD('tree-branch-worn','닳은 가지','nature','🌳','uncommon',2,{observe:.28,wonder:.26},['늘여기앉는다','껍질이없다','반질']),
  // 계절 (4)
  twoD('spring-first-green','첫 초록','nature','🌱','rare',1,{observe:.34,wonder:.32,record:.24},['갈색뿐인데','하나만','찾아냈다']),
  twoD('summer-shadow-deep','짙은 그늘','rest','🌳','uncommon',2,{rest:.34,observe:.22},['까맣다','5도는낮다','안나가고싶다']),
  twoD('autumn-smell','가을 냄새','nature','🍂','rare',1,{observe:.28,wonder:.34},['설명이안된다','알수있다','매년같다']),
  twoD('winter-breath','입김','nature','💨','uncommon',2,{observe:.28,wonder:.26,record:.18},['보인다','금방사라짐','추운줄안다']),
  // 날씨 (3)
  twoD('rain-smell-dry','비 오기 전 냄새','nature','🌧️','rare',1,{observe:.26,wonder:.36},['흙에서','먼저안다','곧온다']),
  twoD('wind-direction-change','바뀐 바람','nature','🌬️','uncommon',2,{observe:.26,wonder:.28},['갑자기','반대로','날씨가바뀐다']),
  twoD('snow-flake-single','한 송이 결정','nature','❄️','rare',1,{observe:.36,wonder:.36,record:.28},['육각형이보인다','소매위','숨을참았다']),
  // 시간대 (2)
  twoD('dawn-blue-hour','푸른 시간','nature','🌌','rare',1,{observe:.34,wonder:.36,record:.26},['해뜨기전','모든게파랗다','짧다']),
  twoD('night-sound-none','소리 없는 밤','rest','🌙','rare',1,{rest:.30,observe:.24,wonder:.34},['아무것도','귀가아프다','드물다']),
  // 상황형 (3)
  twoD('cat-paw-under-door','문틈 앞발','animal','🐾','rare',1,{wonder:.42,observe:.32},['들어오려고','안된다','계속휘젓는다']),
  twoD('bird-feed-hand','손에 앉은 새','animal','🐦','rare',1,{observe:.38,wonder:.38,record:.30},['가볍다','발톱이간지럽다','숨을멈췄다']),
  twoD('dog-head-tilt','고개 갸웃한 개','animal','🐕','rare',1,{wonder:.38,observe:.32,record:.24},['이해하려고','한쪽으로','귀엽다']),
  // 이상하고 웃긴 것 (2)
  twoD('cat-loaf-book','책 위 식빵','animal','📖','rare',1,{wonder:.42,observe:.30,record:.22},['읽던중이었다','안비킨다','다음장은포기']),
  twoD('scarecrow-two-hats','모자 둘 쓴 허수아비','thing','🎩','rare',1,{wonder:.40,observe:.26},['왜','더멋있다','바람에하나만']),
  // 극희귀 (1)
  twoD('deer-family-cross','길 건너는 고라니 가족','rare','🦌','rare',0,{wonder:.8,observe:.5,record:.45},['셋','차를세웠다','천천히갔다'],[],{rareEvent:true}),

  /* ---- batch 2 (826–850) ---- */
  // 일상·생활 (5)
  twoD('sack-needle','포대 바늘','thing','🪡','uncommon',2,{observe:.26,wonder:.18},['크고휘었다','자루를꿰맨다','손이아프다']),
  twoD('funnel-tin','양철 깔때기','thing','🔻','common',3,{observe:.22},['찌그러짐','기름냄새','걸어둠']),
  twoD('measuring-cup','계량컵','thing','🥤','common',3,{observe:.20,record:.10},['눈금이흐려짐','대충','손이안다']),
  twoD('rag-hanging','걸린 걸레','thing','🧽','common',3,{observe:.18},['말리는중','회색','오래썼다']),
  twoD('hook-ceiling','천장 갈고리','thing','🪝','uncommon',2,{observe:.24,wonder:.22},['뭘걸었나','높다','아무것도없다']),
  // 자연·흔적 (5)
  twoD('bird-shadow-ground','땅의 새 그림자','nature','🕊️','uncommon',2,{observe:.30,wonder:.30},['빠르게','지나간다','올려다본다']),
  twoD('ant-line-tree','나무 오르는 개미줄','animal','🐜','uncommon',2,{observe:.30,wonder:.24},['위로만','끝이안보인다','뭐가있나']),
  twoD('leaf-curl-dry','말린 낙엽','nature','🍂','common',3,{observe:.24,wonder:.18},['오므라들었다','바스락','밟으면']),
  twoD('spider-tiny-many','작은 거미들','animal','🕷️','uncommon',2,{observe:.30,wonder:.28},['막깨어남','흩어진다','풀끝마다']),
  twoD('stone-heart','하트 모양 돌','nature','🪨','rare',1,{observe:.32,wonder:.34,record:.26},['우연히','주머니에넣었다','줄까말까']),
  // 계절 (4)
  twoD('spring-worm-many','봄 지렁이','animal','🪱','uncommon',2,{observe:.26,wonder:.22},['비온뒤','길에나옴','돌려보낸다']),
  twoD('summer-fan-broken','안 도는 선풍기','thing','💨','uncommon',2,{observe:.24,wonder:.18},['고장','더맵다','두드려본다']),
  twoD('autumn-jar-fill','채워지는 항아리','thing','🏺','uncommon',2,{observe:.26,record:.16},['김장전','줄지어','뚜껑이무겁다']),
  twoD('winter-window-ice-in','안쪽 성에','nature','❄️','rare',1,{observe:.32,wonder:.30,record:.22},['방안인데','입김때문','긁어낸다']),
  // 날씨 (2)
  twoD('rain-cloud-edge','비구름 경계','nature','🌧️','rare',1,{observe:.34,wonder:.36,record:.26},['여기는비','저기는해','선이보인다']),
  twoD('wind-sound-only','바람 소리만','nature','🌬️','uncommon',2,{observe:.24,wonder:.30},['안보인다','나무가안다','귀로본다']),
  // 시간대 (3)
  twoD('dawn-milk-bottle','새벽 우유병','thing','🥛','uncommon',2,{observe:.26,wonder:.22},['벌써왔다','차갑다','아무도못봤다']),
  twoD('noon-shade-none','그늘 없는 시간','nature','☀️','uncommon',2,{observe:.26,wonder:.22},['숨을데가없다','뜨겁다','빨리지나간다']),
  twoD('night-window-curtain','커튼 그림자','thing','🪟','rare',1,{observe:.30,wonder:.32},['누가움직인다','실루엣','평범한저녁']),
  // 상황형 (2)
  twoD('cat-two-groom','서로 핥는 고양이','animal','🐈','rare',1,{observe:.36,wonder:.30,record:.26},['둘이서','한참','사이가좋다']),
  twoD('bird-mob-crow','까마귀 쫓는 새떼','animal','🐦','rare',1,{observe:.34,wonder:.32,record:.22},['작은새들이','여럿이','까마귀가진다']),
  // 이상하고 웃긴 것 (3)
  twoD('cat-sit-sign','표지판 위 고양이','animal','🪧','rare',1,{wonder:.40,observe:.30,record:.22},['글씨를가린다','뭐라고쓰였나','안비킨다']),
  twoD('shoe-on-wire','전선 위 신발','thing','👟','rare',1,{wonder:.40,observe:.26},['묶여서','흔들린다','전통이맞나']),
  twoD('pot-on-fence-row','울타리 냄비들','thing','🥘','rare',1,{wonder:.36,observe:.26},['거꾸로','말리는중','다섯개']),
  // 극희귀 (1)
  twoD('mandarin-duck-pair','원앙 한 쌍','rare','🦆','rare',0,{wonder:.8,observe:.5,record:.45},['둘이나란히','색이비현실','평생간다고'],[],{rareEvent:true}),

  /* ---- batch 3 (851–875) ---- */
  // 일상·생활 (5)
  twoD('lid-stack','포갠 뚜껑들','thing','🥘','common',3,{observe:.20},['크기순','짝이없다','언젠가맞겠지']),
  twoD('bottle-oil','기름병','thing','🫗','common',3,{observe:.22},['끈적','반쯤','목이좁다']),
  twoD('brush-paint-dry','굳은 붓','thing','🖌️','common',3,{observe:.22,wonder:.16},['빳빳하다','씻을걸','못쓴다']),
  twoD('chair-cushion-worn','눌린 방석','rest','🪑','uncommon',2,{rest:.32,observe:.20},['자국이남음','늘여기앉는다','납작해짐']),
  twoD('calendar-marked','동그라미 친 날','thing','📅','rare',1,{observe:.30,wonder:.32},['무슨날일까','빨간펜','지났다']),
  // 자연·흔적 (5)
  twoD('leaf-water-bead','잎 위 물구슬','nature','💧','uncommon',2,{observe:.32,record:.22},['굴러다닌다','안스며든다','신기하다']),
  twoD('bird-nest-hair','머리카락 둥지','nature','🪹','rare',1,{observe:.32,wonder:.36},['사람것','누구','섞여있다']),
  twoD('ant-dead-carry','죽은 개미 옮기기','animal','🐜','rare',1,{observe:.30,wonder:.34},['동료를','묘지로','안다는걸까']),
  twoD('tree-two-lean','서로 기댄 나무','nature','🌳','uncommon',2,{observe:.30,wonder:.30,record:.20},['둘이','오래','넘어지지않는다']),
  twoD('web-morning-many','아침 거미줄 밭','nature','🕸️','rare',1,{observe:.34,wonder:.34,record:.26},['셀수없다','밤새','다내일사라진다']),
  // 계절 (3)
  twoD('spring-cherry-fall','벚꽃 눈','nature','🌸','rare',1,{observe:.36,wonder:.36,record:.30},['바람한번에','눈처럼','한주만']),
  twoD('summer-rain-steam-road','비 온 뒤 길','nature','♨️','uncommon',2,{observe:.28,wonder:.24},['김이올라온다','뜨거웠나','금방마른다']),
  twoD('winter-sun-low','낮은 겨울 해','nature','🌇','uncommon',2,{observe:.30,wonder:.26,record:.20},['눈이부시다','오후인데','그림자가길다']),
  // 날씨 (3)
  twoD('rain-boot-print','장화 자국','nature','👣','common',3,{observe:.24,wonder:.16},['깊다','물이고임','누가지나감']),
  twoD('wind-cloud-fast','빠른 구름','nature','☁️','uncommon',2,{observe:.28,wonder:.28},['위는바람이센가','그림자가달린다','올려다본다']),
  twoD('fog-fence-vanish','안개에 사라진 울타리','nature','🌫️','uncommon',2,{observe:.28,wonder:.30},['세칸까지만','그다음은없다','묘하다']),
  // 시간대 (2)
  twoD('dawn-lamp-off','꺼지는 가로등','thing','💡','uncommon',2,{observe:.26,wonder:.26},['한꺼번에','해가떴다','자동인가']),
  twoD('night-window-blue-late','늦은 파란 창','thing','📺','uncommon',2,{observe:.26,wonder:.28},['새벽두시','아직','뭘볼까']),
  // 상황형 (3)
  twoD('cat-mouse-watch','쥐구멍 앞 고양이','animal','🐈','rare',1,{observe:.36,wonder:.32},['꼼짝않는다','몇시간째','인내']),
  twoD('bird-cat-food','고양이 밥 훔치는 새','animal','🐦','rare',1,{wonder:.42,observe:.32,record:.24},['대담하다','고양이는잔다','성공']),
  twoD('dog-shadow-chase','그림자 쫓는 개','animal','🐕','rare',1,{wonder:.40,observe:.30},['자기그림자','못잡는다','계속']),
  // 이상하고 웃긴 것 (3)
  twoD('cat-in-shoe-box','신발 상자 속 고양이','animal','📦','rare',1,{wonder:.42,observe:.30,record:.22},['신발은버렸나','정확히맞는다','뿌듯해보인다']),
  twoD('scarecrow-glove-wave','손 흔드는 허수아비','thing','🧤','rare',1,{wonder:.40,observe:.28},['장갑이바람에','인사같다','자꾸본다']),
  twoD('umbrella-hat-person','우산 모자','thing','☂️','rare',1,{wonder:.42,observe:.26},['손이자유롭다','우스꽝','효율적']),
  // 극희귀 (1)
  twoD('fox-family','여우 가족','rare','🦊','rare',0,{wonder:.85,observe:.5,record:.5},['새끼가둘','장난친다','숨도못쉬었다'],[],{rareEvent:true}),

  /* ---- batch 4 (876–900) ---- */
  // 일상·생활 (5)
  twoD('tap-drip','새는 수도','thing','💧','common',3,{observe:.24,wonder:.18},['똑','고쳐야하는데','밤에더크다']),
  twoD('mat-rolled','말아둔 돗자리','thing','🧺','common',3,{observe:.20},['구석에','여름것','먼지앉음']),
  twoD('pot-plant-dead','죽은 화분','thing','🪴','uncommon',2,{observe:.26,wonder:.28},['물을잊었다','흙만남음','안버린다']),
  twoD('shoe-inside-out','뒤집힌 신발','thing','👟','common',3,{observe:.22,wonder:.18},['말리려고','급했나','한짝만']),
  twoD('bulb-bare','알전구','thing','💡','uncommon',2,{observe:.24,wonder:.20},['갓이없다','눈부시다','줄에매달림']),
  // 자연·흔적 (5)
  twoD('grass-seed-sock','양말의 씨앗','nature','🧦','uncommon',2,{observe:.26,wonder:.22},['수십개','떼기힘들다','걸어서옮긴다']),
  twoD('bird-bath-dust-hole','흙목욕 구덩이','nature','🕳️','uncommon',2,{observe:.28,wonder:.24},['움푹','자기몸만하다','또온다']),
  twoD('mushroom-black','까만 버섯','nature','🍄','rare',1,{observe:.30,wonder:.32},['처음본다','먹으면안될것','만지지않았다']),
  twoD('leaf-two-stuck','붙은 잎 둘','nature','🍃','uncommon',2,{observe:.28,wonder:.26},['거미줄로','안떨어진다','같이흔들린다']),
  twoD('tree-scar-face','얼굴 같은 옹이','nature','🌳','rare',1,{observe:.32,wonder:.38,record:.24},['눈코입','한번보면','밤엔안본다']),
  // 계절 (4)
  twoD('spring-mud-boot','봄 진창','nature','🥾','uncommon',2,{observe:.24,wonder:.18},['녹은땅','발이빠진다','질척']),
  twoD('summer-night-window','열어둔 여름 창','thing','🪟','uncommon',2,{observe:.26,rest:.22,wonder:.20},['소리가들어온다','모기도','그래도']),
  twoD('autumn-first-frost','첫 서리','nature','❄️','rare',1,{observe:.34,wonder:.34,record:.24},['오늘아침','지붕만','가을이끝났다']),
  twoD('winter-tap-cloth','헝겊 감은 수도','thing','🧣','uncommon',2,{observe:.26,wonder:.18},['터질까봐','정성스럽게','매년']),
  // 날씨 (2)
  twoD('rain-two-umbrella','우산 둘','thing','☂️','rare',1,{observe:.30,wonder:.28,record:.22},['하나는접혔다','비를맞는다','왜']),
  twoD('snow-print-mine','내 발자국','nature','👣','rare',1,{observe:.30,wonder:.36,record:.24},['돌아본다','유일하다','곧덮인다']),
  // 시간대 (3)
  twoD('dawn-crow-line','새벽 까마귀','animal','🐦‍⬛','uncommon',2,{observe:.26,wonder:.28},['어디로가나','일제히','매일같은시간']),
  twoD('noon-cat-flat','늘어진 정오 고양이','animal','🐈','uncommon',2,{observe:.30,rest:.32,record:.20},['녹았다','뼈가없나','부럽다']),
  twoD('night-lamp-alone','혼자 켜진 등','thing','💡','rare',1,{observe:.28,wonder:.32,rest:.18},['이길에하나','왜여기만','고맙다']),
  // 상황형 (2)
  twoD('cat-kitten-carry-mouth','새끼 옮기는 어미','animal','🐈','rare',1,{observe:.38,wonder:.36,record:.30},['목덜미','새끼는가만히','안전한곳으로']),
  twoD('bird-window-sill','창턱의 새','animal','🐦','rare',1,{observe:.34,wonder:.30,record:.24},['들여다본다','고개를갸웃','안날아간다']),
  // 이상하고 웃긴 것 (2)
  twoD('cat-belly-up','배 보이는 고양이','animal','🐈','rare',1,{wonder:.42,observe:.32,record:.24},['만지면안된다','함정이다','알면서도']),
  twoD('scarecrow-lost-arm','팔 없는 허수아비','thing','🎃','rare',1,{wonder:.38,observe:.26},['한쪽만','기울었다','더열심인듯']),
  // 극희귀 (2)
  twoD('crane-pair','두루미 한 쌍','rare','🕊️','rare',0,{wonder:.85,observe:.5,record:.5},['논에둘','고개를든다','오래봤다'],[],{rareEvent:true}),
  twoD('halo-moon-full','완전한 달무리','rare','🌕','rare',0,{wonder:.8,observe:.5,record:.45},['고리가완벽하다','무지개색','목이아팠다'],[],{rareEvent:true}),

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
