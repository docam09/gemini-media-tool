/**
 * Offline phrasebook for a business trip to Korea.
 *
 * These are the sentences you need when there is no time to talk to a model, or
 * no network at all: immigration, a taxi, a factory floor, an emergency room.
 * Romanization is derived at render time by `romanize`, so nothing here has to
 * be kept in sync by hand.
 */

export interface Phrase {
  vi: string
  ko: string
}

export interface PhraseGroup {
  id: string
  label: string
  /** Preset applied when the user starts speaking from this group. */
  preset: string
  phrases: Phrase[]
}

export const PHRASE_GROUPS: PhraseGroup[] = [
  {
    id: 'essentials',
    label: 'Câu thiết yếu',
    preset: 'none',
    phrases: [
      { vi: 'Xin chào, rất vui được gặp anh/chị.', ko: '안녕하세요, 만나서 반갑습니다.' },
      { vi: 'Xin cảm ơn.', ko: '감사합니다.' },
      { vi: 'Xin lỗi.', ko: '죄송합니다.' },
      { vi: 'Vâng, tôi hiểu rồi.', ko: '네, 알겠습니다.' },
      { vi: 'Xin lỗi, tôi không hiểu.', ko: '죄송하지만 이해하지 못했습니다.' },
      { vi: 'Anh/chị nói chậm hơn một chút được không?', ko: '조금 천천히 말씀해 주시겠어요?' },
      { vi: 'Anh/chị nói lại một lần nữa giúp tôi.', ko: '다시 한 번 말씀해 주세요.' },
      { vi: 'Anh/chị viết ra giúp tôi được không?', ko: '여기에 적어 주실 수 있나요?' },
      { vi: 'Tôi nói được một ít tiếng Hàn.', ko: '한국어를 조금 할 수 있습니다.' },
      { vi: 'Anh/chị có nói tiếng Anh không?', ko: '영어 하실 수 있으세요?' },
      { vi: 'Cho tôi một chút thời gian.', ko: '잠시만 기다려 주세요.' },
    ],
  },
  {
    id: 'work',
    label: 'Nhà máy & họp',
    preset: 'semiconductor',
    phrases: [
      { vi: 'Tôi là Đỗ Hữu Cẩm, đến từ Việt Nam.', ko: '저는 베트남에서 온 도 흐우 깜입니다.' },
      { vi: 'Hôm nay tôi xin phép trình bày về tiến độ dự án.', ko: '오늘은 프로젝트 진행 상황에 대해 말씀드리겠습니다.' },
      { vi: 'Tỷ lệ lỗi của lô này là bao nhiêu phần trăm?', ko: '이 로트의 불량률은 몇 퍼센트입니까?' },
      { vi: 'Cho tôi xem phiếu kiểm tra được không?', ko: '검사 성적서를 볼 수 있을까요?' },
      { vi: 'Vấn đề này nguyên nhân do đâu?', ko: '이 문제의 원인은 무엇입니까?' },
      { vi: 'Khi nào có thể giao hàng?', ko: '납기는 언제 가능합니까?' },
      { vi: 'Tôi cần xác nhận lại với bên Việt Nam.', ko: '베트남 본사와 다시 확인해야 합니다.' },
      { vi: 'Chúng ta chốt lại như vậy nhé.', ko: '그렇게 정리하겠습니다.' },
      { vi: 'Anh/chị gửi cho tôi qua email nhé.', ko: '이메일로 보내 주시면 감사하겠습니다.' },
      { vi: 'Tôi có thể chụp ảnh ở đây không?', ko: '여기서 사진을 찍어도 됩니까?' },
      { vi: 'Tôi cần mặc áo phòng sạch không?', ko: '방진복을 착용해야 합니까?' },
      { vi: 'Nhà vệ sinh ở đâu ạ?', ko: '화장실이 어디예요?' },
    ],
  },
  {
    id: 'travel',
    label: 'Đi lại',
    preset: 'travel',
    phrases: [
      { vi: 'Cho tôi đến khách sạn này.', ko: '이 호텔로 가 주세요.' },
      { vi: 'Cho tôi đến Seoul Semiconductor ở Ansan.', ko: '안산 서울반도체로 가 주세요.' },
      { vi: 'Đi mất bao lâu ạ?', ko: '얼마나 걸립니까?' },
      { vi: 'Bao nhiêu tiền ạ?', ko: '얼마예요?' },
      { vi: 'Tôi có thể trả bằng thẻ không?', ko: '카드로 결제할 수 있나요?' },
      { vi: 'Cho tôi hóa đơn.', ko: '영수증 주세요.' },
      { vi: 'Tôi muốn nhận phòng.', ko: '체크인하고 싶습니다.' },
      { vi: 'Tôi muốn gửi hành lý.', ko: '짐을 보관하고 싶습니다.' },
      { vi: 'Ga tàu điện gần nhất ở đâu?', ko: '가장 가까운 지하철역이 어디예요?' },
      { vi: 'Tôi bị mất đường, giúp tôi với.', ko: '길을 잃었어요, 도와주세요.' },
      { vi: 'Ở đây có wifi không?', ko: '여기 와이파이 있어요?' },
    ],
  },
  {
    id: 'food',
    label: 'Ăn uống',
    preset: 'hoesik',
    phrases: [
      { vi: 'Cho tôi hai người.', ko: '두 명입니다.' },
      { vi: 'Cho tôi món này.', ko: '이거 주세요.' },
      { vi: 'Xin đừng làm cay.', ko: '안 맵게 해 주세요.' },
      { vi: 'Tôi không ăn được thịt heo.', ko: '돼지고기를 못 먹습니다.' },
      { vi: 'Tôi không uống được rượu, xin thông cảm.', ko: '술을 잘 못 마십니다, 죄송합니다.' },
      { vi: 'Cạn ly!', ko: '건배!' },
      { vi: 'Món này rất ngon.', ko: '이거 정말 맛있어요.' },
      { vi: 'Cảm ơn anh/chị đã mời tôi.', ko: '초대해 주셔서 감사합니다.' },
      { vi: 'Cho tôi tính tiền.', ko: '계산해 주세요.' },
      { vi: 'Hôm nay để tôi mời.', ko: '오늘은 제가 사겠습니다.' },
    ],
  },
  {
    id: 'emergency',
    label: 'Khẩn cấp',
    preset: 'medical',
    phrases: [
      { vi: 'Giúp tôi với!', ko: '도와주세요!' },
      { vi: 'Tôi cần đi bệnh viện.', ko: '병원에 가야 합니다.' },
      { vi: 'Xin gọi cấp cứu 119.', ko: '119에 신고해 주세요.' },
      { vi: 'Tôi bị đau ở đây.', ko: '여기가 아파요.' },
      { vi: 'Tôi bị sốt và đau đầu.', ko: '열이 나고 머리가 아파요.' },
      { vi: 'Tôi bị dị ứng thuốc kháng sinh.', ko: '항생제 알레르기가 있습니다.' },
      { vi: 'Hiệu thuốc gần nhất ở đâu?', ko: '가장 가까운 약국이 어디예요?' },
      { vi: 'Tôi có bảo hiểm du lịch.', ko: '여행자 보험이 있습니다.' },
      { vi: 'Xin liên hệ đại sứ quán Việt Nam.', ko: '베트남 대사관에 연락해 주세요.' },
      { vi: 'Tôi bị mất hộ chiếu.', ko: '여권을 잃어버렸습니다.' },
    ],
  },
]
