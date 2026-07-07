Attribute VB_Name = "QuarterlyGrowthChart"
Option Explicit

' =============================================================================
'  BIỂU ĐỒ TĂNG TRƯỞNG THEO QUÝ  (Năm trước vs Năm sau)
'
'  Tái tạo thiết kế slide: mỗi quý một panel nền kem có thanh cam trên đỉnh,
'  hai cột gradient (xanh = năm trước, cam = năm sau), mũi tên cong và
'  con số % tăng trưởng so với cùng kỳ.
'
'  Cách dùng:
'    1) Chạy macro  SetupTemplate  -> tạo sheet "Du lieu" với bảng nhập liệu mẫu
'    2) Sửa số liệu trong bảng (thêm/bớt dòng quý tùy ý)
'    3) Bấm nút "Tạo biểu đồ" (hoặc chạy macro BuildChart)
'       -> biểu đồ được vẽ trên sheet "Bieu do"
'
'  Cột "Tăng trưởng" và "Xu hướng" có thể bỏ trống — macro tự tính từ số liệu.
' =============================================================================

Private Const DATA_SHEET As String = "Du lieu"
Private Const CHART_SHEET As String = "Bieu do"
Private Const PREFIX As String = "QGC_"        ' tiền tố tên shape để dọn/vẽ lại
Private Const FIRST_ROW As Long = 4            ' dòng dữ liệu đầu tiên
Private Const MAX_ROWS As Long = 12            ' số quý tối đa

' ----- Kích thước (đơn vị point) ---------------------------------------------
Private Const MARGIN_LEFT As Single = 30
Private Const MARGIN_TOP As Single = 36
Private Const PANEL_W As Single = 160          ' bề rộng panel mỗi quý
Private Const PANEL_H As Single = 320          ' chiều cao panel
Private Const GROUP_GAP As Single = 36         ' khoảng cách giữa các panel
Private Const STRIP_H As Single = 8            ' thanh cam trên đỉnh panel
Private Const BAR_W As Single = 42             ' bề rộng một cột
Private Const BAR_GAP As Single = 10           ' khe hở giữa hai cột
Private Const BAR_MAX_H As Single = 170        ' chiều cao cột ứng với giá trị lớn nhất

' ----- Màu sắc ----------------------------------------------------------------
Private Function BLUE_TOP() As Long:    BLUE_TOP = RGB(59, 130, 246):   End Function
Private Function BLUE_BOT() As Long:    BLUE_BOT = RGB(29, 78, 216):    End Function
Private Function ORANGE_TOP() As Long:  ORANGE_TOP = RGB(251, 191, 36): End Function
Private Function ORANGE_BOT() As Long:  ORANGE_BOT = RGB(234, 122, 11): End Function
Private Function PANEL_TOP() As Long:   PANEL_TOP = RGB(251, 231, 194): End Function
Private Function PANEL_BOT() As Long:   PANEL_BOT = RGB(255, 253, 248): End Function
Private Function STRIP_CLR() As Long:   STRIP_CLR = RGB(245, 168, 28):  End Function
Private Function NAVY() As Long:        NAVY = RGB(30, 42, 90):         End Function
Private Function ORANGE_TXT() As Long:  ORANGE_TXT = RGB(238, 125, 26): End Function
Private Function BLUE_TXT() As Long:    BLUE_TXT = RGB(36, 88, 214):    End Function
Private Function AXIS_GREY() As Long:   AXIS_GREY = RGB(216, 216, 216): End Function
Private Function TEXT_DARK() As Long:   TEXT_DARK = RGB(58, 58, 58):    End Function

' =============================================================================
'  1) TẠO TEMPLATE NHẬP LIỆU
' =============================================================================
Public Sub SetupTemplate()
    Dim ws As Worksheet
    Set ws = GetOrCreateSheet(DATA_SHEET)
    ws.Cells.Clear

    ws.Range("A1").Value = "DỮ LIỆU BIỂU ĐỒ TĂNG TRƯỞNG THEO QUÝ"
    With ws.Range("A1").Font
        .Bold = True: .Size = 14: .Color = NAVY
    End With

    ' --- Header bảng (B3/C3 chính là tên 2 chuỗi hiển thị ở chú giải) --------
    ws.Range("A3:E3").Value = Array("Quý", "Năm 2025", "Năm 2026", _
                                    "Tăng trưởng", "Xu hướng")
    With ws.Range("A3:E3")
        .Font.Bold = True
        .Font.Color = vbWhite
        .Interior.Color = NAVY
        .HorizontalAlignment = xlCenter
    End With

    ' --- Dữ liệu mẫu (đúng như hình tham chiếu) -------------------------------
    ws.Range("A4:E4").Value = Array("Quý 1", 3, 4, 0.3, "TĂNG")
    ws.Range("A5:E5").Value = Array("Quý 2", 2.5, 3.5, 0.4, "TĂNG")
    ws.Range("A6:E6").Value = Array("Quý 3", 3.5, 2, 0.25, "GIẢM")
    ws.Range("A7:E7").Value = Array("Quý 4", 3, 4.5, 0.45, "TĂNG")

    Dim tbl As Range
    Set tbl = ws.Range(ws.Cells(3, 1), ws.Cells(FIRST_ROW + MAX_ROWS - 1, 5))
    tbl.Borders.LineStyle = xlContinuous
    tbl.Borders.Color = RGB(190, 190, 190)
    ws.Range(ws.Cells(FIRST_ROW, 4), ws.Cells(FIRST_ROW + MAX_ROWS - 1, 4)) _
        .NumberFormat = "0%"
    ws.Range(ws.Cells(FIRST_ROW, 2), ws.Cells(FIRST_ROW + MAX_ROWS - 1, 3)) _
        .HorizontalAlignment = xlCenter
    ws.Range(ws.Cells(FIRST_ROW, 4), ws.Cells(FIRST_ROW + MAX_ROWS - 1, 5)) _
        .HorizontalAlignment = xlCenter
    ws.Columns("A:E").ColumnWidth = 13

    ' --- Data validation cho cột Xu hướng -------------------------------------
    With ws.Range(ws.Cells(FIRST_ROW, 5), ws.Cells(FIRST_ROW + MAX_ROWS - 1, 5)).Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Formula1:="TĂNG,GIẢM"
        .IgnoreBlank = True
        .InCellDropdown = True
    End With

    ' --- Ghi chú ---------------------------------------------------------------
    ws.Range("A" & FIRST_ROW + MAX_ROWS + 1).Value = _
        "Ghi chú: sửa tiêu đề cột B3/C3 để đổi nhãn năm ở chú giải." & vbLf & _
        "Cột ""Tăng trưởng"" và ""Xu hướng"" bỏ trống thì macro tự tính từ số liệu." & vbLf & _
        "Thêm/bớt dòng quý tùy ý (tối đa " & MAX_ROWS & " quý), sau đó bấm ""Tạo biểu đồ""."
    With ws.Range("A" & FIRST_ROW + MAX_ROWS + 1)
        .Font.Italic = True: .Font.Size = 10: .Font.Color = RGB(110, 110, 110)
        .WrapText = False
    End With

    ' --- Nút bấm ---------------------------------------------------------------
    Dim btn As Button
    On Error Resume Next
    ws.Buttons("QGC_Button").Delete
    On Error GoTo 0
    Set btn = ws.Buttons.Add(ws.Range("G3").Left, ws.Range("G3").Top, 110, 32)
    btn.Name = "QGC_Button"
    btn.Caption = "Tạo biểu đồ"
    btn.OnAction = "BuildChart"
    btn.Font.Bold = True

    ws.Activate
    MsgBox "Đã tạo template. Sửa số liệu rồi bấm nút ""Tạo biểu đồ"".", _
           vbInformation, "Quarterly Growth Chart"
End Sub

' =============================================================================
'  2) VẼ BIỂU ĐỒ
' =============================================================================
Public Sub BuildChart()
    Dim wsD As Worksheet
    On Error Resume Next
    Set wsD = Worksheets(DATA_SHEET)
    On Error GoTo 0
    If wsD Is Nothing Then
        MsgBox "Chưa có sheet """ & DATA_SHEET & """. Hãy chạy macro SetupTemplate trước.", vbExclamation
        Exit Sub
    End If

    ' --- Đọc dữ liệu ------------------------------------------------------------
    Dim n As Long, r As Long
    Do While wsD.Cells(FIRST_ROW + n, 1).Value <> "" And n < MAX_ROWS
        n = n + 1
    Loop
    If n = 0 Then
        MsgBox "Không có dữ liệu (bắt đầu từ dòng " & FIRST_ROW & ", cột A).", vbExclamation
        Exit Sub
    End If

    Dim quarter() As String, vPrev() As Double, vCurr() As Double
    Dim growth() As String, isUp() As Boolean
    ReDim quarter(1 To n): ReDim vPrev(1 To n): ReDim vCurr(1 To n)
    ReDim growth(1 To n): ReDim isUp(1 To n)

    Dim maxV As Double, i As Long
    For i = 1 To n
        r = FIRST_ROW + i - 1
        quarter(i) = CStr(wsD.Cells(r, 1).Value)
        vPrev(i) = CDbl(wsD.Cells(r, 2).Value)
        vCurr(i) = CDbl(wsD.Cells(r, 3).Value)
        If vPrev(i) > maxV Then maxV = vPrev(i)
        If vCurr(i) > maxV Then maxV = vCurr(i)

        If IsNumeric(wsD.Cells(r, 4).Value) And wsD.Cells(r, 4).Value <> "" Then
            growth(i) = Format$(wsD.Cells(r, 4).Value, "0%")
        ElseIf wsD.Cells(r, 4).Value <> "" Then
            growth(i) = CStr(wsD.Cells(r, 4).Value)
        ElseIf vPrev(i) <> 0 Then
            growth(i) = Format$(Abs(vCurr(i) - vPrev(i)) / vPrev(i), "0%")
        Else
            growth(i) = "-"
        End If

        Select Case UCase$(Trim$(CStr(wsD.Cells(r, 5).Value)))
            Case "GIẢM", "GIAM", "DOWN": isUp(i) = False
            Case "TĂNG", "TANG", "UP":   isUp(i) = True
            Case Else:                   isUp(i) = (vCurr(i) >= vPrev(i))
        End Select
    Next i
    If maxV <= 0 Then maxV = 1

    ' --- Chuẩn bị sheet vẽ ------------------------------------------------------
    Dim wsC As Worksheet
    Set wsC = GetOrCreateSheet(CHART_SHEET)
    DeleteOldShapes wsC
    wsC.Activate
    ActiveWindow.DisplayGridlines = False

    Dim scaleF As Single, baselineY As Single, totalW As Single
    scaleF = BAR_MAX_H / maxV
    baselineY = MARGIN_TOP + PANEL_H
    totalW = n * PANEL_W + (n - 1) * GROUP_GAP

    Dim shp As Shape, gLeft As Single, cx As Single

    ' --- Lớp 1: panel nền + thanh cam ------------------------------------------
    For i = 1 To n
        gLeft = MARGIN_LEFT + (i - 1) * (PANEL_W + GROUP_GAP)

        Set shp = wsC.Shapes.AddShape(msoShapeRoundedRectangle, _
                                      gLeft, MARGIN_TOP, PANEL_W, PANEL_H)
        shp.Name = PREFIX & "Panel" & i
        shp.Adjustments(1) = 0.03
        FillGradient shp, PANEL_TOP, PANEL_BOT
        shp.Shadow.Visible = msoFalse

        Set shp = wsC.Shapes.AddShape(msoShapeRoundedRectangle, _
                                      gLeft - 3, MARGIN_TOP - 4, PANEL_W + 6, STRIP_H)
        shp.Name = PREFIX & "Strip" & i
        shp.Adjustments(1) = 0.5
        shp.Fill.ForeColor.RGB = STRIP_CLR
        shp.Line.Visible = msoFalse
        shp.Shadow.Visible = msoFalse
    Next i

    ' --- Lớp 2: đường trục đáy ---------------------------------------------------
    Set shp = wsC.Shapes.AddShape(msoShapeRectangle, _
                                  MARGIN_LEFT - 18, baselineY - 2, totalW + 36, 4)
    shp.Name = PREFIX & "Baseline"
    shp.Fill.ForeColor.RGB = AXIS_GREY
    shp.Line.Visible = msoFalse
    shp.Shadow.Visible = msoFalse

    ' --- Lớp 3: chữ, mũi tên, cột, nhãn -----------------------------------------
    Dim barLeft As Single, barH As Single, pctColor As Long
    For i = 1 To n
        gLeft = MARGIN_LEFT + (i - 1) * (PANEL_W + GROUP_GAP)
        cx = gLeft + PANEL_W / 2

        ' Tiêu đề panel
        AddText wsC, "Title" & i, gLeft + 5, MARGIN_TOP + 16, PANEL_W - 10, 58, _
                "Tăng trưởng" & vbLf & "so với cùng kỳ" & vbLf & quarter(i), _
                12, NAVY, True

        ' % tăng trưởng + mũi tên cong
        pctColor = IIf(isUp(i), ORANGE_TXT, BLUE_TXT)
        AddText wsC, "Pct" & i, gLeft + 12, MARGIN_TOP + 102, 78, 40, _
                growth(i), 26, pctColor, True

        If isUp(i) Then
            Set shp = wsC.Shapes.AddShape(msoShapeCurvedUpArrow, _
                                          gLeft + 98, MARGIN_TOP + 88, 36, 50)
            shp.Flip msoFlipHorizontal
        Else
            Set shp = wsC.Shapes.AddShape(msoShapeCurvedDownArrow, _
                                          gLeft + 98, MARGIN_TOP + 100, 36, 50)
        End If
        shp.Name = PREFIX & "Arrow" & i
        shp.Fill.ForeColor.RGB = pctColor
        shp.Line.Visible = msoFalse
        shp.Shadow.Visible = msoFalse

        ' Cột xanh (năm trước) và cột cam (năm sau)
        barLeft = cx - BAR_GAP / 2 - BAR_W
        barH = vPrev(i) * scaleF
        DrawBar wsC, "BarPrev" & i, barLeft, baselineY, barH, BLUE_TOP, BLUE_BOT, vPrev(i)

        barLeft = cx + BAR_GAP / 2
        barH = vCurr(i) * scaleF
        DrawBar wsC, "BarCurr" & i, barLeft, baselineY, barH, ORANGE_TOP, ORANGE_BOT, vCurr(i)

        ' Nhãn quý dưới trục
        AddText wsC, "QLabel" & i, gLeft, baselineY + 12, PANEL_W, 22, _
                quarter(i), 13, TEXT_DARK, False
    Next i

    ' --- Chú giải ----------------------------------------------------------------
    Dim centerX As Single, legendY As Single
    centerX = MARGIN_LEFT + totalW / 2
    legendY = baselineY + 44
    DrawLegendItem wsC, "LegPrev", centerX - 120, legendY, BLUE_BOT, CStr(wsD.Cells(3, 2).Value)
    DrawLegendItem wsC, "LegCurr", centerX + 15, legendY, ORANGE_BOT, CStr(wsD.Cells(3, 3).Value)

    wsC.Range("A1").Select
End Sub

' =============================================================================
'  Helpers
' =============================================================================
Private Sub DrawBar(ws As Worksheet, nm As String, barLeft As Single, _
                    baselineY As Single, barH As Single, _
                    cTop As Long, cBot As Long, val As Double)
    Dim shp As Shape
    If barH < 1 Then barH = 1
    ' Hình chữ nhật bo tròn 2 góc trên, đáy vuông đặt trên trục
    Set shp = ws.Shapes.AddShape(msoShapeRound2SameRectangle, _
                                 barLeft, baselineY - barH, BAR_W, barH)
    shp.Name = PREFIX & nm
    shp.Adjustments(1) = 0.12
    shp.Adjustments(2) = 0
    FillGradient shp, cTop, cBot
    shp.Shadow.Visible = msoFalse

    ' Nhãn giá trị màu trắng trong đầu cột
    If barH >= 26 Then
        AddText ws, nm & "_v", barLeft, baselineY - barH + 6, BAR_W, 20, _
                TrimNum(val), 13, vbWhite, True
    End If
End Sub

Private Sub DrawLegendItem(ws As Worksheet, nm As String, x As Single, _
                           y As Single, clr As Long, caption As String)
    Dim shp As Shape
    Set shp = ws.Shapes.AddShape(msoShapeRectangle, x, y, 11, 11)
    shp.Name = PREFIX & nm & "_sq"
    shp.Fill.ForeColor.RGB = clr
    shp.Line.Visible = msoFalse
    shp.Shadow.Visible = msoFalse
    AddTextL ws, nm & "_tx", x + 16, y - 3, 90, 18, caption, 12, TEXT_DARK, False
End Sub

Private Sub FillGradient(shp As Shape, cTop As Long, cBot As Long)
    With shp.Fill
        .Visible = msoTrue
        .TwoColorGradient msoGradientHorizontal, 1
        .GradientStops(1).Color.RGB = cTop
        .GradientStops(1).Position = 0
        .GradientStops(2).Color.RGB = cBot
        .GradientStops(2).Position = 1
        .GradientAngle = 90          ' trên -> dưới
    End With
    shp.Line.Visible = msoFalse
End Sub

Private Sub AddText(ws As Worksheet, nm As String, l As Single, t As Single, _
                    w As Single, h As Single, txt As String, sizePt As Single, _
                    clr As Long, boldOn As Boolean)
    AddTextBox ws, nm, l, t, w, h, txt, sizePt, clr, boldOn, msoAlignCenter
End Sub

Private Sub AddTextL(ws As Worksheet, nm As String, l As Single, t As Single, _
                     w As Single, h As Single, txt As String, sizePt As Single, _
                     clr As Long, boldOn As Boolean)
    AddTextBox ws, nm, l, t, w, h, txt, sizePt, clr, boldOn, msoAlignLeft
End Sub

Private Sub AddTextBox(ws As Worksheet, nm As String, l As Single, t As Single, _
                       w As Single, h As Single, txt As String, sizePt As Single, _
                       clr As Long, boldOn As Boolean, align As MsoParagraphAlignment)
    Dim shp As Shape
    Set shp = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, l, t, w, h)
    shp.Name = PREFIX & nm
    shp.Fill.Visible = msoFalse
    shp.Line.Visible = msoFalse
    With shp.TextFrame2
        .WordWrap = msoTrue
        .AutoSize = msoAutoSizeNone
        .MarginLeft = 0: .MarginRight = 0
        .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorTop
        .TextRange.Text = txt
        .TextRange.ParagraphFormat.Alignment = align
        With .TextRange.Font
            .Name = "Segoe UI"
            .Size = sizePt
            .Bold = IIf(boldOn, msoTrue, msoFalse)
            .Fill.ForeColor.RGB = clr
        End With
    End With
End Sub

Private Sub DeleteOldShapes(ws As Worksheet)
    Dim i As Long
    For i = ws.Shapes.Count To 1 Step -1
        If Left$(ws.Shapes(i).Name, Len(PREFIX)) = PREFIX Then ws.Shapes(i).Delete
    Next i
End Sub

Private Function GetOrCreateSheet(nm As String) As Worksheet
    On Error Resume Next
    Set GetOrCreateSheet = Worksheets(nm)
    On Error GoTo 0
    If GetOrCreateSheet Is Nothing Then
        Set GetOrCreateSheet = Worksheets.Add(After:=Worksheets(Worksheets.Count))
        GetOrCreateSheet.Name = nm
    End If
End Function

Private Function TrimNum(v As Double) As String
    ' 2.5 -> "2.5", 3 -> "3" (không phụ thuộc locale)
    TrimNum = CStr(v)
End Function
