"""Domain presets shipped with the app.

Each preset pre-fills the situational context and the glossary that the
translator sends to Gemini. Getting the domain right is where most of the
accuracy comes from: without it, ``lô`` becomes ``\ubd80\ubd84`` instead of ``\ub85c\ud2b8`` and
``quang thông`` becomes a literal ``\ubc1d\uc740 \uc18c\uc2dd`` rather than ``\uad11\uc18d``.

Glossary lines are ``vietnamese = korean`` pairs; the model applies them in
both directions.
"""

from __future__ import annotations

from typing import TypedDict


class Preset(TypedDict):
    label: str
    description: str
    context: str
    glossary: str


PRESETS: dict[str, Preset] = {
    "none": {
        "label": "Chung",
        "description": "Hội thoại hằng ngày, không ràng buộc thuật ngữ.",
        "context": "",
        "glossary": "",
    },
    "semiconductor": {
        "label": "Bán dẫn / LED",
        "description": "Họp kỹ thuật, chất lượng và sản xuất tại công ty LED / bán dẫn.",
        "context": (
            "Cuộc họp kỹ thuật tại nhà máy LED / bán dẫn Hàn Quốc. Chủ đề: chip LED, "
            "đóng gói (packaging), wafer, dây chuyền SMT, đo quang, độ tin cậy, "
            "tỷ lệ lỗi và tiến độ giao hàng. Dùng thuật ngữ kỹ thuật chuẩn của "
            "ngành bán dẫn Hàn Quốc, giữ nguyên các từ viết tắt tiếng Anh."
        ),
        "glossary": "\n".join(
            [
                "lô hàng = 로트",
                "quang thông = 광속",
                "hiệu suất phát quang = 발광 효율",
                "nhiệt độ màu = 색온도",
                "chỉ số hoàn màu = 연색성",
                "sụt áp thuận = 순방향 전압",
                "tỷ lệ lỗi = 불량률",
                "hàng lỗi = 불량품",
                "kiểm tra ngoại quan = 외관 검사",
                "dây chuyền sản xuất = 생산 라인",
                "năng suất = 수율",
                "thử nghiệm độ tin cậy = 신뢰성 시험",
                "phiếu kiểm tra = 검사 성적서",
                "bản vẽ kỹ thuật = 도면",
                "đóng gói chip = 칩 패키징",
                "tấm wafer = 웨이퍼",
                "tản nhiệt = 방열",
                "hàn dán bề mặt = 표면 실장",
                "thiết bị đo = 측정 장비",
                "hiệu chuẩn = 교정",
                "yêu cầu kỹ thuật = 스펙",
                "hành động khắc phục = 시정 조치",
                "phân tích nguyên nhân gốc = 근본 원인 분석",
                "tiến độ giao hàng = 납기",
            ]
        ),
    },
    "meeting": {
        "label": "Họp / công tác",
        "description": "Họp với đối tác, báo cáo, thương lượng, lịch làm việc.",
        "context": (
            "Cuộc họp công tác giữa nhân viên Việt Nam và đối tác Hàn Quốc: giới thiệu, "
            "báo cáo tiến độ, thương lượng điều khoản, chốt lịch làm việc và biên bản. "
            "Giữ mức độ lịch sự trang trọng phù hợp với môi trường doanh nghiệp Hàn Quốc, "
            "dùng đúng chức danh."
        ),
        "glossary": "\n".join(
            [
                "biên bản họp = 회의록",
                "báo giá = 견적서",
                "hợp đồng = 계약서",
                "điều khoản thanh toán = 결제 조건",
                "tiến độ = 진행 상황",
                "hạn chót = 마감 기한",
                "phụ trách = 담당자",
                "trưởng phòng = 부장님",
                "giám đốc = 사장님",
                "phòng mua hàng = 구매팀",
                "phòng chất lượng = 품질팀",
                "công tác = 출장",
                "đề xuất = 제안",
                "xác nhận lại = 재확인",
            ]
        ),
    },
    "hoesik": {
        "label": "Tiệc tối / hoesik",
        "description": "Ăn uống cùng đối tác, chúc mừng, từ chối rượu một cách lịch sự.",
        "context": (
            "Tiệc tối công ty (hoesik) với đối tác Hàn Quốc: gọi món, chúc mừng, "
            "cảm ơn, từ chối rượu một cách lịch sự, nói chuyện xã giao. Giọng điệu "
            "ấm áp, lịch sự, tự nhiên như người Hàn nói trong bàn tiệc."
        ),
        "glossary": "\n".join(
            [
                "cạn ly = 건배",
                "tôi không uống được rượu = 술을 잘 못 마십니다",
                "cảm ơn vì đã mời = 초대해 주셔서 감사합니다",
                "món đặc sản = 대표 메뉴",
                "thêm một phần nữa = 하나 더 주세요",
                "không cay = 안 맵게",
                "tính tiền = 계산",
            ]
        ),
    },
    "travel": {
        "label": "Đi lại / khách sạn",
        "description": "Sân bay, taxi, tàu điện, khách sạn, nhà hàng, mua sắm.",
        "context": (
            "Khách Việt Nam đi công tác tại Hàn Quốc đang xử lý việc đi lại thường ngày: "
            "nhập cảnh, taxi, tàu điện, nhận phòng khách sạn, gọi món ở nhà hàng, mua sắm. "
            "Câu ngắn, rõ, lịch sự, dễ nghe cho người bản xứ."
        ),
        "glossary": "\n".join(
            [
                "nhận phòng = 체크인",
                "trả phòng = 체크아웃",
                "hóa đơn = 영수증",
                "hoàn thuế = 택스 리펀",
                "sân bay Incheon = 인천공항",
                "xe buýt sân bay = 공항버스",
                "gửi hành lý = 짐 보관",
                "cho tôi hỏi đường = 길 좀 여쭤볼게요",
            ]
        ),
    },
    "medical": {
        "label": "Y tế / khẩn cấp",
        "description": "Bệnh viện, hiệu thuốc, tai nạn, gọi cấp cứu.",
        "context": (
            "Tình huống y tế hoặc khẩn cấp tại Hàn Quốc: mô tả triệu chứng ở bệnh viện "
            "hoặc hiệu thuốc, khai dị ứng và tiền sử bệnh, gọi cấp cứu. Dịch chính xác "
            "tuyệt đối, không suy diễn, không lược bỏ chi tiết nào về liều lượng, "
            "thời gian hay bộ phận cơ thể."
        ),
        "glossary": "\n".join(
            [
                "cấp cứu = 응급실",
                "hiệu thuốc = 약국",
                "đau bụng = 배가 아파요",
                "sốt = 열이 나요",
                "dị ứng = 알레르기",
                "bảo hiểm du lịch = 여행자 보험",
                "đơn thuốc = 처방전",
                "tôi cần gặp bác sĩ = 의사 선생님을 만나야 합니다",
            ]
        ),
    },
}

DEFAULT_PRESET = "none"
