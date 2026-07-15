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
