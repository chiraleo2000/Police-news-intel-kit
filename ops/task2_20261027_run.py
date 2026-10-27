# -*- coding: utf-8 -*-
# Task 2 LINE run of 2026-10-27 (window: yesterday 2026-10-26 links with status=new). add-only.
import json,os,re,glob,collections,datetime,html,shutil
D='2026-10-26'; DC='20261026'
NOW=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).replace(microsecond=0).isoformat()
reg={}
for f in glob.glob('github-pages/data/*_crime.json'):
    for p in json.load(open(f,encoding='utf-8')).get('posts',[]):
        for pv,rg in zip(p.get('province',[]),p.get('region',[]) or []): reg[pv]=rg
reg.update({'ปทุมธานี':'กรุงเทพฯ และปริมณฑล','เชียงใหม่':'ภาคเหนือ','พิษณุโลก':'ภาคเหนือ','กรุงเทพมหานคร':'กรุงเทพฯ และปริมณฑล'})
TOP={'CYBER':'อาชญากรรมไซเบอร์และออนไลน์','DRUG':'ยาเสพติด'}
UP='ผู้ถูกกล่าวหายังไม่ถือว่ากระทำผิดจนกว่าศาลจะพิพากษา'
U_A='https://bangkokbiznews.com/news/news-update/1257869'
U_B='https://www.siamnews.com/news/social/56085'
U_C='https://www.naewna.com/n/top-stories/132522'
S=[]
S.append(dict(id=DC+'-cyber-line-01',code='CYBER',sec=['TRANSNAT'],
 title='บช.ก.-บก.ป. จับหญิงวัย 32 ปี ตามหมายจับศาลเชียงใหม่ ปมบัญชีม้าแก๊งหลอกลงทุนออนไลน์ ที่ปทุมธานี ตามข้อกล่าวหา',
 agency='สื่อไทย > กรุงเทพธุรกิจ',src_name='กรุงเทพธุรกิจ',src=U_A,prio='C',sev='medium',ver='single_source',stage='จับกุม',role='ปราบปรามเชิงรุก',
 prov=['ปทุมธานี','เชียงใหม่'],alert=True,imp=False,pub='2026-10-26T12:05:00+07:00',
 tags=['บัญชีม้าหลอกลงทุนออนไลน์','หมายจากศาลเชียงใหม่'],
 bureau='บช.ก.',area='ปทุมธานี',status_th='จับกุมแล้ว ส่งพนักงานสอบสวนดำเนินคดี',gang='-',
 stats=dict(arrested=1,suspects=1,victims=None,loss_thb=None,seized_value_thb=None),
 units=['บช.ก.','บก.ป.','สภ.สันทราย','ศาลจังหวัดเชียงใหม่'],
 ents=dict(units=[('บช.ก.','จับโดย'),('บก.ป.','จับโดย'),('สภ.สันทราย','สืบสวนโดย'),('ศาลจังหวัดเชียงใหม่','หมายจากศาล')],places=['ธัญบุรี']),
 content=('เมื่อวันที่ 26 ตุลาคม 2569 เจ้าหน้าที่ตำรวจสอบสวนกลาง (บช.ก.) ร่วมกับกองบังคับการปราบปราม (บก.ป.) จับกุมหญิงอายุ 32 ปี ซึ่งข่าวระบุเพียงชื่อย่อ ตามหมายจับของศาลจังหวัดเชียงใหม่ ที่ออกเมื่อวันที่ 10 กันยายน 2569 บริเวณถนนรังสิต-นครนายก ข้างห้างสรรพสินค้าแห่งหนึ่ง ตำบลประชาธิปัตย์ อำเภอธัญบุรี จังหวัดปทุมธานี ข้อกล่าวหาหลักตามข่าวคือเป็นผู้สนับสนุนการฉ้อโกงประชาชน เป็นผู้สนับสนุนการนำข้อมูลคอมพิวเตอร์ที่เป็นเท็จหรือปลอมเข้าสู่ระบบคอมพิวเตอร์ และเปิดหรือยอมให้ผู้อื่นใช้บัญชีเงินฝากของตนโดยรู้หรือควรรู้ว่าอาจนำไปใช้ก่ออาชญากรรมทางเทคโนโลยี '
  'ที่มาของคดีย้อนไปในปี 2567 เมื่อผู้เสียหายรายหนึ่งแจ้งความว่าถูกชักชวนให้ลงทุนใน "ธุรกิจออนไลน์รายได้ดี" โดยแก๊งคอลเซ็นเตอร์สร้างโปรไฟล์ที่ดูน่าเชื่อถือ ส่งสลิปโอนเงินปลอมให้ดู และให้ลงทุนจำนวนน้อยก่อนเพื่อให้ถอนกำไรได้จริง จนผู้เสียหายไว้ใจและทยอยลงทุนเพิ่มจนยอดสะสมสูงถึงหลักแสนบาท ต่อมาคนร้ายอ้างว่าบัญชีถูกล็อกและต้องโอนเงินเพื่อปลดล็อก ทำให้ผู้เสียหายต้องโอนเพิ่มอีก เมื่อรู้ตัวว่าถูกหลอกจึงแจ้งความ การตรวจสอบเส้นทางการเงินพบว่าเงินถูกโอนเข้าบัญชีม้าที่เปิดด้วยชื่อของผู้ต้องหา '
  'ตามคำให้การของผู้ต้องหาที่ข่าวอ้างถึง ในปี 2567 มีกลุ่มเพื่อนชักชวนไปทำงานที่เมืองปอยเปต ประเทศกัมพูชา โดยอ้างค่าตอบแทนสูง มีรถรับไปยังชายแดนจังหวัดสระแก้ว แล้วถูกพาเดินเท้าลักลอบข้ามพรมแดนธรรมชาติ เมื่อถึงจุดหมายจึงทราบว่าต้องทำงานให้แก๊งคอลเซ็นเตอร์ชาวจีน หน้าที่หลักคือสแกนใบหน้าผ่านแอปพลิเคชันธนาคารเพื่ออนุมัติการโอนเงิน และถอนเงินสดออกจากบัญชีม้าทันทีที่ได้เงินมา เพื่อไม่ให้ทันการอายัดบัญชี คำให้การส่วนนี้เป็นข้ออ้างของผู้ต้องหาซึ่งต้องพิสูจน์ตามกระบวนการสอบสวน '
  'หลังจับกุม ตำรวจส่งตัวผู้ต้องหาให้พนักงานสอบสวน สถานีตำรวจภูธรสันทราย จังหวัดเชียงใหม่ เพื่อดำเนินคดีตามกฎหมาย การปฏิบัติการอยู่ภายใต้การกำกับของผู้บังคับการในสังกัด บช.ก. โดยกองกำกับการ 2 บก.ป. เป็นผู้รับผิดชอบ รายงานนี้ไม่ระบุชื่อผู้ต้องหา และผู้ต้องหายังถือเป็นผู้บริสุทธิ์จนกว่าศาลจะมีคำพิพากษา'),
 pa=['อย่าเปิดบัญชีธนาคารหรือยอมให้ผู้อื่นใช้บัญชีของตน เพราะมีโทษทางอาญา แม้ไม่ได้ร่วมหลอกลวงโดยตรง','หากถูกชักชวนให้ลงทุนหรือทำงานต่างประเทศรายได้สูง ให้ตรวจสอบกับหน่วยงานทางการก่อน และแจ้งความผ่าน 1441 หรือ thaipoliceonline.go.th'],
 ao=['ธนาคารควรเฝ้าระวังบัญชีที่มีการรับโอนแล้วถอนเงินสดทันทีและตรวจสอบการยืนยันตัวตนด้วยใบหน้าที่ผิดปกติ','หน่วยงานรณรงค์ควรสื่อสารว่าการรับจ้างเปิดหรือใช้บัญชีให้ผู้อื่นมีความผิด'],
 op='จับกุมตามหมายจับศาลจังหวัดเชียงใหม่ที่ปทุมธานี',outcome='จับกุม',note='ส่งตัวพนักงานสอบสวน สภ.สันทราย จังหวัดเชียงใหม่',
 exec_='เมื่อ 26 ต.ค. 2569 บช.ก. ร่วมกับ บก.ป. จับหญิงวัย 32 ปีตามหมายจับศาลจังหวัดเชียงใหม่ที่ ธัญบุรี ปทุมธานี ข้อหาสนับสนุนการฉ้อโกงและให้ใช้บัญชีเงินฝากก่ออาชญากรรมเทคโนโลยี ต้นเรื่องคือผู้เสียหายถูกหลอกลงทุนออนไลน์ในปี 2567 เงินเข้าบัญชีม้าที่ใช้ชื่อผู้ต้องหา สถานะที่แหล่งระบุคือจับกุมแล้วและส่งพนักงานสอบสวน สภ.สันทราย ผู้ต้องหาอ้างว่าถูกชักชวนไปทำงานที่ปอยเปต ซึ่งยังต้องพิสูจน์',
 ev='บช.ก. ร่วมกับ บก.ป. จับหญิงวัย 32 ปีตามหมายจับศาลจังหวัดเชียงใหม่ ที่อำเภอธัญบุรี จังหวัดปทุมธานี ในคดีบัญชีม้าของแก๊งหลอกลงทุนออนไลน์ที่ผู้เสียหายแจ้งความเมื่อปี 2567',
 unitline='บช.ก. และ บก.ป. เป็นผู้จับ ศาลจังหวัดเชียงใหม่ออกหมายจับ สภ.สันทรายรับตัวดำเนินคดี สถานะ จับกุมแล้ว',
 num='อายุผู้ต้องหา 32 ปี หมายจับลงวันที่ 10 กันยายน 2569 ยอดความเสียหายของผู้เสียหายรายนี้ระบุเพียงว่าหลักแสนบาท',
 grp='ไม่มี (ข่าวไม่ระบุชื่อกลุ่ม ใช้คำว่าแก๊งคอลเซ็นเตอร์ทั่วไป)',protect=True,
 laws=['ประมวลกฎหมายอาญา (ผู้สนับสนุนการฉ้อโกง)','พ.ร.บ.ว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์','พ.ร.ก.มาตรการป้องกันและปราบปรามอาชญากรรมทางเทคโนโลยี (เปิดบัญชีให้ผู้อื่นใช้)']))
S.append(dict(id=DC+'-cyber-line-02',code='CYBER',sec=['CONSUMER'],
 title='ผู้เสียหายกว่า 30 คน รวมตัวร้อง บก.ป. เร่งรัดคดีพรีออเดอร์การ์ด ONE PIECE ไม่ได้รับของ เสียหายรวมกว่า 47 ล้านบาท',
 agency='สื่อไทย > สยามนิวส์',src_name='สยามนิวส์',src=U_B,prio='C',sev='medium',ver='single_source',stage='ร้องทุกข์',role='สอบสวน',
 prov=['กรุงเทพมหานคร'],alert=True,imp=True,pub='2026-10-26T14:39:00+07:00',
 tags=['พรีออเดอร์การ์ด ONE PIECE'],
 bureau='บก.ป.',area='กรุงเทพมหานคร',status_th='ผู้เสียหายยื่นเร่งรัดคดี ยังไม่มีการจับกุมตามที่ข่าวระบุ',gang='-',
 stats=dict(arrested=0,suspects=1,victims=30,loss_thb=47000000,seized_value_thb=None),
 units=['บก.ป.'],ents=dict(units=[('บก.ป.','สืบสวนโดย')],places=['กรุงเทพมหานคร']),
 content=('เมื่อเวลา 10.00 น. วันที่ 26 ตุลาคม 2569 ทนายความและผู้เสียหายประมาณ 30 คน เดินทางไปที่ศูนย์รับเรื่องร้องทุกข์ของตำรวจสอบสวนกลาง เพื่อยื่นหนังสือขอให้พนักงานสอบสวนกองบังคับการปราบปรามเร่งรัดคดีที่ผู้เสียหายจ่ายเงินสั่งซื้อสินค้าการ์ดเกม ONE PIECE แบบพรีออเดอร์ แต่ไม่ได้รับสินค้าและไม่ได้รับเงินคืน โดยผู้เสียหายชูป้ายสัญลักษณ์ระหว่างยื่นเรื่อง ทนายความระบุว่าความเสียหายรวมกว่า 47 ล้านบาท ผู้เสียหายบางรายสูญเงินสูงสุดราว 9 ล้านบาท ผู้เสียหายรายหนึ่งระบุว่าต้องขายทรัพย์สินเพื่อนำเงินไปคืนลูกค้าของตน '
  'ตามคำบอกเล่าของผู้เสียหาย ผู้ต้องสงสัยเป็นบุคคลที่ผู้เสียหายส่วนใหญ่รู้จัก สร้างโปรไฟล์และชื่อเสียงให้น่าเชื่อถือ แสดงสินค้าเหมือนมีของจริง และใช้สินค้าราคาถูกดึงดูดคำสั่งซื้อ ช่วงแรกส่งของจริง แต่ต่อมาการส่งมอบล่าช้าและผู้ต้องสงสัยเริ่มบ่ายเบี่ยง เมื่อผู้เสียหายตรวจสอบกับผู้จัดจำหน่ายพบว่ามีการสั่งซื้อผ่านผู้เสียหายกว่า 800 เคส แต่สั่งจากผู้จัดจำหน่ายจริงเพียงประมาณ 200 เคส และสินค้าที่สั่งก็ยังไม่ถูกส่งมอบ ผู้เสียหายกล่าวหาว่าผู้ต้องสงสัยปลอมเอกสารการสั่งซื้อ และสร้างบัญชีเฟซบุ๊กปลอมแอบอ้างเป็นผู้จัดจำหน่าย รวมทั้งอาจใช้ชื่อบุคคลที่มีชื่อเสียงเพื่อสร้างความน่าเชื่อถือ '
  'ทนายความตั้งข้อสังเกตว่าผู้ต้องสงสัยอาจเป็นรายเดียวกับคดีก่อนหน้าที่เกี่ยวกับ "ใจทัสมิต" แต่ผู้เสียหายรายหนึ่งตอบเมื่อถูกถามว่าเป็นคนละกลุ่มและไม่เกี่ยวข้องกัน ทนายความระบุว่าคดีเริ่มมาตั้งแต่ต้นปีนี้โดยยังไม่เห็นความคืบหน้า และผู้ต้องสงสัยยังใช้ชีวิตตามปกติ ข้อมูลทั้งหมดเป็นคำกล่าวอ้างของฝ่ายผู้เสียหายตามที่สื่อรายงาน ข่าวไม่ได้ระบุคำชี้แจงของพนักงานสอบสวนหรือผู้ถูกกล่าวหา และยังไม่มีการจับกุมในขณะรายงาน รายงานนี้ไม่ระบุชื่อผู้ต้องสงสัย และผู้ถูกกล่าวหาถือเป็นผู้บริสุทธิ์จนกว่าศาลจะมีคำพิพากษา'),
 pa=['ก่อนจ่ายเงินพรีออเดอร์ ให้ตรวจสอบใบสั่งซื้อกับผู้จัดจำหน่ายหรือผู้นำเข้ารายใหญ่โดยตรง และระวังบัญชีที่แอบอ้างเป็นผู้จัดจำหน่าย','เก็บหลักฐานการโอนเงินและแชต แล้วแจ้งความที่สถานีตำรวจหรือ thaipoliceonline.go.th'],
 ao=['ผู้จัดจำหน่ายสินค้าควรมีช่องทางยืนยันคำสั่งซื้อให้ร้านค้าปลีกตรวจสอบได้','แพลตฟอร์มโซเชียลควรเร่งตรวจสอบบัญชีที่แอบอ้างเป็นแบรนด์หรือผู้จัดจำหน่าย'],
 op='ผู้เสียหายยื่นหนังสือเร่งรัดคดีที่ศูนย์รับเรื่องร้องทุกข์ตำรวจสอบสวนกลาง',outcome='อื่น ๆ',note='ยังไม่มีการจับกุมตามที่ข่าวระบุ',
 exec_='เมื่อ 26 ต.ค. 2569 ผู้เสียหายราว 30 คนพร้อมทนายความยื่นหนังสือต่อตำรวจสอบสวนกลาง ขอให้ บก.ป. เร่งรัดคดีพรีออเดอร์การ์ด ONE PIECE ที่ไม่ได้รับสินค้า ความเสียหายรวมกว่า 47 ล้านบาท ผู้เสียหายบางรายสูญสูงสุดราว 9 ล้านบาท สถานะที่แหล่งระบุคือผู้เสียหายเร่งรัดคดี ยังไม่มีการจับกุม ข้อมูลเป็นคำกล่าวอ้างของผู้เสียหาย ผู้เสียหายระบุว่าสั่งผ่านผู้เสียหายกว่า 800 เคส แต่สั่งจากผู้จัดจำหน่ายจริงราว 200 เคส',
 ev='ผู้เสียหายราว 30 คนยื่นหนังสือเร่งรัดคดีพรีออเดอร์การ์ด ONE PIECE ที่ศูนย์รับเรื่องร้องทุกข์ตำรวจสอบสวนกลาง ผู้เสียหายอ้างว่าไม่ได้รับสินค้าและเงินคืน',
 unitline='บก.ป. ตำรวจสอบสวนกลาง เป็นหน่วยที่รับหนังสือเร่งรัด สถานะ ผู้เสียหายเร่งรัดคดี ยังไม่มีการจับกุม',
 num='ผู้เสียหายราว 30 คน ความเสียหายรวมกว่า 47,000,000 บาท ผู้เสียหายสูงสุดราว 9,000,000 บาท สั่งผ่านผู้เสียหายกว่า 800 เคส สั่งจากผู้จัดจำหน่ายจริงราว 200 เคส',
 grp='ไม่มี',protect=False,laws=['ประมวลกฎหมายอาญา (ฉ้อโกง ปลอมเอกสาร)','พ.ร.ก.มาตรการป้องกันและปราบปรามอาชญากรรมทางเทคโนโลยี']))
S.append(dict(id=DC+'-drug-line-01',code='DRUG',sec=['CORRUPT'],
 title='ป.ป.ส. จับตำรวจสังกัด ภ.6 พร้อมพวก 1 ราย พิษณุโลก ยึดยาบ้า 87 เม็ด ไอซ์ 0.92 กรัม ตามข้อกล่าวหา',
 agency='สื่อไทย > แนวหน้า',src_name='แนวหน้า',src=U_C,prio='B',sev='medium',ver='single_source',stage='จับกุม',role='ปราบปรามเชิงรุก',
 prov=['พิษณุโลก'],alert=False,imp=False,pub='2026-10-26T15:23:00+07:00',
 tags=['ตำรวจค้ายาบ้า-ไอซ์ พิษณุโลก','ตัดเนื้อร้ายครั้งที่ 26'],
 bureau='สำนักงาน ป.ป.ส.',area='พิษณุโลก',status_th='จับกุมแล้ว ส่งพนักงานสอบสวนดำเนินคดี ขยายผลเครือข่าย',gang='-',
 stats=dict(arrested=2,suspects=2,victims=None,loss_thb=None,seized_value_thb=None),
 units=['สำนักงาน ป.ป.ส.','สภ.เมืองพิษณุโลก'],ents=dict(units=[('สำนักงาน ป.ป.ส.','จับโดย'),('สภ.เมืองพิษณุโลก','สืบสวนโดย')],places=['พิษณุโลก']),
 content=('สำนักงานคณะกรรมการป้องกันและปราบปรามยาเสพติด (ป.ป.ส.) กระทรวงยุติธรรม จับกุมเจ้าหน้าที่ตำรวจสังกัดตำรวจภูธรภาค 6 และผู้ร่วมขบวนการที่เป็นพลเรือนอีก 1 ราย ในข้อกล่าวหาเกี่ยวข้องกับการค้ายาบ้าและยาไอซ์ในจังหวัดพิษณุโลก ข่าวเผยแพร่เมื่อวันที่ 26 ตุลาคม 2569 ต้นเรื่องมาจากการร้องเรียนผ่านสายด่วน 1386 ของ ป.ป.ส. ซึ่งชี้เป้าว่ามีเจ้าหน้าที่ตำรวจรายหนึ่งเกี่ยวข้องกับการซื้อขายและเสพยาเสพติดในพื้นที่จังหวัดพิษณุโลก เจ้าหน้าที่จึงสืบสวนหาข้อมูลเพิ่มเติมและวางแผนเข้าตรวจค้น '
  'เมื่อช่วงเย็นวันที่ 24 ตุลาคม 2569 เจ้าหน้าที่เข้าตรวจค้นสถานที่เป้าหมายแห่งหนึ่งในพื้นที่อำเภอพรหมพิราม จังหวัดพิษณุโลก ตรวจยึดยาบ้า 87 เม็ด และยาไอซ์น้ำหนัก 0.92 กรัม ผู้ต้องหาทั้งสองรายถูกแจ้งข้อกล่าวหาร่วมกันมียาเสพติดให้โทษประเภท 1 ไว้ในครอบครองเพื่อจำหน่าย และถูกส่งตัวให้พนักงานสอบสวน สถานีตำรวจภูธรเมืองพิษณุโลก ดำเนินคดีตามกฎหมาย '
  'ข่าวระบุว่า เจ้าหน้าที่ ป.ป.ส. ประสานผู้บังคับบัญชาของเจ้าหน้าที่ตำรวจรายนี้เข้าตรวจค้นที่พักอาศัยด้วย และกำลังขยายผลไปยังเครือข่ายที่เกี่ยวข้อง ปฏิบัติการนี้ถูกนำเสนอว่าเป็นส่วนหนึ่งของปฏิบัติการ "ตัดเนื้อร้าย" ครั้งที่ 26 และนโยบายปราบปรามยาเสพติดของรัฐบาล ซึ่งใช้กับเจ้าหน้าที่ของรัฐด้วยเช่นกัน พร้อมเชิญชวนประชาชนแจ้งเบาะแสผ่านสายด่วน 1386 รายงานนี้ไม่ระบุชื่อผู้ต้องหา และผู้ต้องหาทั้งสองรายยังถือเป็นผู้บริสุทธิ์จนกว่าศาลจะมีคำพิพากษา'),
 pa=['พบเบาะแสผู้เกี่ยวข้องกับยาเสพติด แจ้งสายด่วน ป.ป.ส. 1386 ได้ตลอด 24 ชั่วโมง','ไม่รับฝากหรือขนส่งสิ่งของให้ผู้อื่นโดยไม่ทราบที่มา เพราะอาจถูกดำเนินคดีร่วม'],
 ao=['ต้นสังกัดควรมีกลไกตรวจสอบภายในและร่วมมือกับ ป.ป.ส. เมื่อมีเบาะแสเจ้าหน้าที่เกี่ยวข้องกับยาเสพติด','ควรเผยแพร่ผลการดำเนินวินัยและคดีของเจ้าหน้าที่ที่ถูกดำเนินคดีให้สาธารณะตรวจสอบได้ตามกฎหมาย'],
 op='ตรวจค้นสถานที่เป้าหมายที่อำเภอพรหมพิราม หลังได้รับเบาะแสสายด่วน 1386',outcome='จับกุม',note='ยึดยาบ้า 87 เม็ด ไอซ์ 0.92 กรัม และตรวจค้นที่พักร่วมกับต้นสังกัด',
 exec_='เมื่อ 24 ต.ค. 2569 ป.ป.ส. ตรวจค้นสถานที่เป้าหมายที่อำเภอพรหมพิราม จังหวัดพิษณุโลก ยึดยาบ้า 87 เม็ด ไอซ์ 0.92 กรัม จับตำรวจสังกัด ภ.6 และพวก 1 ราย ข้อหามียาเสพติดประเภท 1 ไว้เพื่อจำหน่าย ต้นเรื่องคือเบาะแสสายด่วน 1386 สถานะที่แหล่งระบุคือจับกุมแล้ว ส่ง สภ.เมืองพิษณุโลก และ ป.ป.ส. กำลังขยายผลเครือข่าย',
 ev='ป.ป.ส. จับตำรวจสังกัด ภ.6 และพวก 1 ราย หลังตรวจค้นที่อำเภอพรหมพิราม พิษณุโลก ยึดยาบ้า 87 เม็ดและไอซ์ 0.92 กรัม จากเบาะแสสายด่วน 1386',
 unitline='ป.ป.ส. เป็นผู้จับ สภ.เมืองพิษณุโลกรับตัวดำเนินคดี สถานะ จับกุมแล้ว ขยายผลเครือข่าย',
 num='ยาบ้า 87 เม็ด ยาไอซ์ 0.92 กรัม ผู้ต้องหา 2 ราย ปฏิบัติการตัดเนื้อร้ายครั้งที่ 26',
 grp='ไม่มี',protect=False,laws=['พ.ร.บ.ยาเสพติดให้โทษ (ประเภท 1 ครอบครองเพื่อจำหน่าย)']))
DUPS=[ # (file-suffix list, post id, name, url)
 ('2026-10-26','20261026-gamble-02','แนวหน้า','https://www.naewna.com/n/breaking/131252/'),
 ('2026-10-27','20261027-cyber-01','เดลินิวส์','https://dailynews.co.th/news/6306450'),
 ('2026-10-27','20261027-gamble-02','สยามนิวส์','https://www.siamnews.com/news/social/56097'),
 ('2026-10-27','20261027-police-02','สยามนิวส์','https://www.siamnews.com/news/social/56088')]
def region(p): return list(dict.fromkeys(reg.get(x,'') for x in p['prov']))
def notes(p):
    cau=UP+(' ไม่ระบุตัวตนผู้เสียหายและผู้ต้องหาตามหลักคุ้มครอง' if p['protect'] else '')
    return '\n'.join(['- เหตุการณ์: '+p['ev'],'- หน่วยและสถานะ: '+p['unitline'],'- ตัวเลขในข่าว: '+p['num'],'- ชื่อกลุ่มที่ข่าวระบุ: '+p['grp'],'- ความเชื่อมโยง: ไม่มีเส้นไปข่าวอื่น — ไม่ใช่เหตุการณ์เดียวกันหรือการติดตามผลที่ชี้ได้','- ข้อควรระวัง: '+cau])
posts=[]
for p in S:
    posts.append({'id':p['id'],'slug':p['id'],'title':p['title'],'topic':TOP[p['code']],'secondary_topics':[],'agency':p['agency'],'origin':'line_curated','priority':p['prio'],'severity':p['sev'],'verification':p['ver'],'case_stage':p['stage'],'police_role':p['role'],
 'province':p['prov'],'region':region(p),'alert':p['alert'],'impersonation':p['imp'],'is_clarification':False,'content':p['content'],'source_url':p['src'],'corroborating_sources':[],
 'actions_public':p['pa'],'actions_org':p['ao'],'police_performance':{'operation':p['op'],'units_involved':p['units'],'outcome':p['outcome'],'note':p['note']},'stats':p['stats'],'tags':p['tags'][:2],'category_label':TOP[p['code']],'published_at':p['pub'],
 'modus_operandi':[],'related_laws':p['laws'],'source_name':p['src_name'],'meta':{'batch':'L','tags':p['tags'][:2]},'source':{'origin':'line_curated'},'merge_into_task1':False,'format_version':2,'primary_bureau':p['bureau'],'area':p['area'],'status_th':p['status_th'],'gang_or_group':p['gang'],
 'exec_blurb':p['exec_'],'analysis_notes':notes(p),'related_cases':[],'references':[{'name':'แหล่งหลัก','url':p['src']}],'_day':D})
# ---- JSON (add-only: keep posts already in file)
path='github-pages/data/%s_crime_line.json'%D
old=json.load(open(path,encoding='utf-8')) if os.path.exists(path) else {'posts':[]}
keep=[x for x in old.get('posts',[]) if x['id'] not in {p['id'] for p in posts}]
allp=keep+posts
byc=collections.Counter(p['topic'] for p in allp)
st={'links_attempted':8+3,'links_used':len(posts)+len(DUPS),'total':len(allp),'new_cases':len(posts),'merged_into_existing':len(DUPS),'direct':0,'indirect':0,'line_curated':len(allp),
 'alerts':sum(p['alert'] for p in allp),'by_crime_type':dict(byc),'total_loss_thb':sum((p['stats'].get('loss_thb') or 0) for p in allp),'total_seized_value_thb':0,'total_arrested':sum((p['stats'].get('arrested') or 0) for p in allp),'skipped_social_reference_only':3,'skipped_fetch_failed':1}
doc={'date':D,'generated_at':NOW,'stats':st,'posts':allp,'format_version':2}
od='Document/%s_CrimeLine'%D; os.makedirs(od,exist_ok=True)
for pth in (path,od+'/%s_crime_line.json'%D): json.dump(doc,open(pth,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
# derived
hs=collections.defaultdict(lambda:{'region':'','ids':[],'types':collections.Counter()})
for p in allp:
    pv=p['province'][0];h=hs[pv];h['region']=(p['region'] or [''])[0];h['ids'].append(p['id']);h['types'][p['topic']]+=1
hot=[{'province':k,'region':v['region'],'count':len(v['ids']),'top_crime_types':[t for t,_ in v['types'].most_common(3)],'post_ids':v['ids']} for k,v in hs.items()]
al={'alerts':[{'id':p['id'],'title':p['title'],'topic':p['topic'],'actions_public':p['actions_public'],'impersonation':p['impersonation']} for p in allp if p['alert']],'impersonation':[p['id'] for p in allp if p['impersonation']]}
tr={'baseline':'insufficient','window_days':7,'note':'Task 2 LINE · เทียบแนวโน้มไม่ได้เพราะชุดวันนี้มีเพียง %d เหตุการณ์ใหม่'%len(posts),'by_crime_type':[{'type':t,'today':c,'avg_prev_7d':None,'delta_pct':None,'surge':False} for t,c in byc.items()]}
ref=json.load(open('reference/budget-fy2570-police-related.json',encoding='utf-8'))
leads=[]
for it in ref.get('related_projects_top',[]):
    nm=json.dumps(it,ensure_ascii=False)
    if 'CyberTH' in nm:
        leads.append({'project':it.get('project'),'budget_thb':it.get('budget_thb'),'tech':it.get('tech','Cybersecurity'),'relevance':'กลาง','news_ids':[p['id'] for p in posts if p['code' if False else 'id'] and 'cyber' in p['id']],'rationale':'ข่าวบัญชีม้าและการหลอกลงทุนออนไลน์ (จับคู่ตามหมวดเทคโนโลยีเท่านั้น ไม่ใช่การยืนยันความต้องการของหน่วยงาน)'})
        break
bd={'date':D,'source':'reference/budget-fy2570-police-related.json','note':'จับคู่ตามหมวดเทคโนโลยี/หน่วยงานเท่านั้น ไม่ใช่การยืนยันความต้องการของหน่วยงาน','leads':leads}
for nm,o in [('alerts',al),('hotspots',hot),('trends',tr),('bd_leads',bd)]:
    json.dump(o,open('github-pages/data/%s_%s_line.json'%(D,nm),'w',encoding='utf-8'),ensure_ascii=False,indent=1)
json.dump(al,open(od+'/_alerts.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
json.dump(tr,open(od+'/_trends.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
json.dump(bd,open(od+'/_bd_leads.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
json.dump({t:{'count':c,'post_ids':[p['id'] for p in allp if p['topic']==t]} for t,c in byc.items()},open(od+'/_by_crime_type.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
json.dump({'links_total_in_window':11,'used_new':[p['id'] for p in posts],'dup_event':[d[1] for d in DUPS],'skipped':{'social_reference_only':3,'fetch_failed':['https://policetv.tv/archives/56020']}},open(od+'/_index.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
tg=collections.Counter(t for p in allp for t in p['tags'])
json.dump({'tags':[{'tag':t,'count':c} for t,c in tg.items()]},open(od+'/_tags.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
# ---- vault: case notes
def san(n): return re.sub(r'[\\/:*?"<>|]','-',n)
os.makedirs('vault/20_Cases',exist_ok=True)
for p,s in zip(posts,S):
    ru=[{'target':'30_Entities/Units/'+san(u),'rel':r} for u,r in s['ents']['units']]+[{'target':'30_Entities/Places/'+san(x),'rel':'เกิดที่'} for x in s['ents']['places']]
    fm=['---','type: case','generated: true','format_version: 2','case_id: "%s"'%p['id'],'date: %s'%D,'crime_type: "%s"'%p['topic'],'bureau: "%s"'%p['primary_bureau'],'area: "%s"'%p['area'],'status_th: "%s"'%p['status_th'],'gang_or_group: "-"','severity: %s'%p['severity'],'verification: %s'%p['verification'],
     'provinces: %s'%json.dumps(p['province'],ensure_ascii=False),'units: %s'%json.dumps(s['units'],ensure_ascii=False),'tags: %s'%json.dumps(p['tags'],ensure_ascii=False),'sources: %s'%json.dumps([p['source_url']],ensure_ascii=False),
     'rel_units: %s'%json.dumps(ru,ensure_ascii=False),'rel_people: []','rel_projects: []','rel_cases: []','---','']
    body=['# '+p['title'],'','- ประเภท: [[%s]]'%p['topic'],'- หน่วย: '+', '.join(s['units']),'',p['content'],'','## ข้อแนะนำประชาชน']+['- '+x for x in p['actions_public']]+['','_%s_'%UP,'','## สำหรับผู้บริหาร',p['exec_blurb'],'## วิเคราะห์',p['analysis_notes'],'## แหล่งที่มา','- [%s](%s)'%(p['source_name'],p['source_url']),'',
     '## ข้อมูลกราฟของข่าวนี้']+['- %s %s'%(r,u) for u,r in s['ents']['units']]+['- เกิดที่ %s'%x for x in s['ents']['places']]+['- กราฟ: github-pages/data/graphs/%s.svg และ .json'%p['id'],'- ไม่มีเส้นไปข่าวอื่น — ไม่ใช่เหตุการณ์เดียวกันหรือการติดตามผลที่ชี้ได้','',
     '## ความสัมพันธ์']+['- %s [[30_Entities/Units/%s|%s]]'%(r,san(u),u) for u,r in s['ents']['units']]+['- เกิดที่ [[30_Entities/Places/%s|%s]]'%(san(x),x) for x in s['ents']['places']]+['','## เชื่อมข่าวก่อนหน้า','ไม่มีเส้นไปข่าวที่มาก่อนหน้านี้','']
    open('vault/20_Cases/%s.md'%p['id'],'w',encoding='utf-8').write('\n'.join(fm+body))
    for u,_ in s['ents']['units']:
        fn='vault/30_Entities/Units/%s.md'%san(u); line='- [[%s]] %s\n'%(p['id'],p['title'][:80])
        if os.path.exists(fn):
            t=open(fn,encoding='utf-8').read()
            if p['id'] not in t: open(fn,'a',encoding='utf-8').write(('\n## %s\n'%D if '\n## %s\n'%D not in t else '')+line)
        else: open(fn,'w',encoding='utf-8').write('---\ngenerated: true\ntype: unit\n---\n# %s\n\n## %s\n'%(u,D)+line)
    for x in s['ents']['places']:
        fn='vault/30_Entities/Places/%s.md'%san(x); line='- [[%s]] %s\n'%(p['id'],p['title'][:80])
        if os.path.exists(fn):
            t=open(fn,encoding='utf-8').read()
            if p['id'] not in t: open(fn,'a',encoding='utf-8').write(('\n## %s\n'%D if '\n## %s\n'%D not in t else '')+line)
        else: open(fn,'w',encoding='utf-8').write('---\ngenerated: true\ntype: entity\n---\n# %s\n\n## %s\n'%(x,D)+line)
# crime types add-only
byt=collections.defaultdict(list)
for p in posts: byt[p['topic']].append(p)
for t,ps in byt.items():
    fn='vault/40_CrimeTypes/%s.md'%t
    new=''.join('- [[%s]] %s (LINE)\n'%(p['id'],p['title']) for p in ps)
    s=open(fn,encoding='utf-8').read() if os.path.exists(fn) else '---\ngenerated: true\ntype: crime_type\n---\n# %s\n'%t
    hd='\n## %s (LINE)\n'%D
    if hd in s: s=s.rstrip('\n')+'\n'+''.join(l for l in new.splitlines(True) if l not in s)
    else: s=s.rstrip('\n')+'\n'+hd+new
    open(fn,'w',encoding='utf-8').write(s)
# ---- DUP_EVENT append-only
for day,pid,nm,url in DUPS:
    for f in ('github-pages/data/%s_crime.json'%day,'Document/%s_Crime/%s_crime.json'%(day,day)):
        d=json.load(open(f,encoding='utf-8'))
        for p in d['posts']:
            if p['id']==pid:
                if url not in [c['url'] for c in p['corroborating_sources']]+[p['source_url']]:
                    p['corroborating_sources'].append({'name':nm,'url':url}); p['references'].append({'name':nm,'url':url})
                    if 'source_count' in p: p['source_count']+=1
        json.dump(d,open(f,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
    nf='vault/20_Cases/%s.md'%pid; t=open(nf,encoding='utf-8').read()
    if url not in t:
        m=re.search(r'^sources: (\[.*\])$',t,re.M)
        if m:
            arr=json.loads(m.group(1)); arr.append(url); t=t.replace(m.group(0),'sources: '+json.dumps(arr,ensure_ascii=False))
        else:
            src=json.load(open('github-pages/data/%s_crime.json'%day,encoding='utf-8'))
            pp=[x for x in src['posts'] if x['id']==pid][0]
            arr=[pp['source_url']]+[c['url'] for c in pp['corroborating_sources']]
            t=t.replace('\n---\n','\nsources: '+json.dumps(arr,ensure_ascii=False)+'\n---\n',1)
        if '## แหล่งที่มา' in t:
            i=t.index('## แหล่งที่มา'); j=t.find('\n## ',i+5); j=len(t) if j<0 else j
            t=t[:j].rstrip('\n')+'\n- [%s](%s)\n'%(nm,url)+t[j:]
        open(nf,'w',encoding='utf-8').write(t)
# ---- HTML
e=html.escape
css=open('Document/2026-10-22_CrimeLine/2026-10-22_crime_line.html',encoding='utf-8').read().split('<style>')[1].split('</style>')[0]
h=['<html><head><meta charset="utf-8"><title>%s</title>\n<style>%s</style>\n</head><body>'%(D,css),'<h1>สรุปข่าว จาก LINE %s</h1>'%D,'<p>จัดกลุ่มตามประเภทคดี แต่ละเรื่องมีเนื้อข่าว มุมผู้บริหาร การวิเคราะห์ แหล่งที่มา และการเชื่อมโยง</p>']
for t,ps in byt.items():
    h.append('<h2>%s (%d)</h2>'%(e(t),len(ps)))
    for p in ps:
        h+=['<h3>%s</h3>'%e(p['title']),'<div class="m">%s · %s · %s</div>'%(e(p['primary_bureau']),e(p['status_th']),e(p['area'])),'<p>%s</p>'%e(p['content']),'<p><b>มุมผู้บริหาร:</b> %s</p>'%e(p['exec_blurb']),'<p><b>วิเคราะห์</b></p><ul>'+''.join('<li>%s</li>'%e(l[2:]) for l in p['analysis_notes'].split('\n'))+'</ul>',
         '<p><b>แหล่งที่มา</b></p><ul class="sources"><li><a href="%s">%s</a> — <span class="m">%s</span></li></ul>'%(e(p['source_url']),e(p['source_name']),e(p['source_url'])),'<p><b>เชื่อมโยง:</b> ไม่มีเส้นไปข่าวอื่น</p>','<p class="m">ประเภทคดี: %s · พื้นที่: %s · สถานะ: %s · กลุ่ม/แก๊ง: -</p>'%(e(p['topic']),e(p['area']),e(p['status_th']))]
if DUPS: h.append('<h2>แหล่งเพิ่มให้เหตุการณ์ที่มีอยู่แล้ว (%d)</h2><ul>'%len(DUPS)+''.join('<li>%s — %s (%s)</li>'%(e(pid),e(nm),e(u)) for _,pid,nm,u in DUPS)+'</ul>')
h.append('</body></html>')
open(od+'/%s_crime_line.html'%D,'w',encoding='utf-8').write('\n'.join(h))
open(od+'/%s_crime_line.md'%D,'w',encoding='utf-8').write('# สรุปข่าว จาก LINE %s\n\n'%D+'\n'.join('## %s\n\n%s\n\n- แหล่ง: %s\n'%(p['title'],p['exec_blurb'],p['source_url']) for p in posts))
# infographic html
cols=''.join("<div class='r'><span class='l'>%s</span><span class='b' style='width:%dpx;background:#2e86de'></span><b>%d</b></div>"%(e(t),c*90,c) for t,c in byc.items())
cards=''.join("<div class='card'>%s<small>%s · %s</small></div>"%(e(p['title']),e(p['primary_bureau']),e(p['area'])) for p in posts)
inf="<!doctype html><html lang='th'><head><meta charset='utf-8'><style>"+open('Document/2026-10-22_CrimeLine/2026-10-22_infographic_line.html',encoding='utf-8').read().split('<style>')[1].split('</style>')[0]+"</style></head><body><div class='w'><h1>สรุปข่าวตำรวจจาก LINE</h1><div>26 ตุลาคม พ.ศ. 2569</div><h2>ภาพรวม</h2><div class='kp'><div><b>%d</b>เหตุการณ์ใหม่</div><div><b>%d</b>ผู้ต้องหาถูกจับ</div><div><b>%d</b>เพิ่มแหล่งเดิม</div></div><h2>ประเภท</h2>%s<h2>เหตุการณ์</h2>%s<div class='f'>ผู้ถูกกล่าวหายังไม่ถือว่ากระทำผิดจนกว่าศาลจะพิพากษา</div></div></body></html>"%(len(posts),st['total_arrested'],len(DUPS),cols,cards)
open(od+'/%s_infographic_line.html'%D,'w',encoding='utf-8').write(inf)
os.makedirs(od+'/fonts',exist_ok=True)
for f in os.listdir('Document/2026-10-22_CrimeLine/fonts'):
    if not os.path.exists(od+'/fonts/'+f): shutil.copy('Document/2026-10-22_CrimeLine/fonts/'+f,od+'/fonts/'+f)
# brain daily
ents=collections.defaultdict(list)
for p,s in zip(posts,S):
    for u,_ in s['ents']['units']: ents[u].append(p['id'])
open(od+'/_brain_daily.md','w',encoding='utf-8').write('---\ngenerated: true\ndate: %s\nsource: task-2-line\n---\n# Second Brain — LINE %s\n\n> เฉพาะข่าวที่ผ่านเกณฑ์ตำรวจ/อาชญากรรม · merge_proposal = proposed เท่านั้น ยังไม่ได้ใช้งาน\n\n## Entities (หน่วย → คดี)\n'%(D,D)+''.join('- %s: %s\n'%(u,', '.join('`%s`'%i for i in ids)) for u,ids in ents.items())+'\n## merge_proposal\n- บช.ก. กับ บก.ป. เป็นหน่วยตำรวจสอบสวนกลาง — สถานะ proposed (ยังไม่รวม)\n')
shutil.copy(od+'/_brain_daily.md','github-pages/data/%s_brain_daily_line.md'%D)
print('posts',len(posts),'total',len(allp),'bdleads',len(leads))
