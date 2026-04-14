import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/models/mobile_patient.dart';
import '../../core/models/signature_event.dart';
import '../../core/providers.dart';
import '../../core/signature/svg_builder.dart';

enum _Step { form, sign, success }

const List<String> _monthNames = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

class VpAntragScreen extends ConsumerStatefulWidget {
  final MobilePatient patient;

  const VpAntragScreen({
    super.key,
    required this.patient,
  });

  @override
  ConsumerState<VpAntragScreen> createState() => _VpAntragScreenState();
}

class _VpAntragScreenState extends ConsumerState<VpAntragScreen> {
  _Step _step = _Step.form;

  // Form
  final _pflegepersonController = TextEditingController();
  String? _pflegepersonError;
  late int _month;
  late int _year;
  bool _markingNotWanted = false;

  // Signature
  final List<List<Offset>> _strokes = [];
  List<Offset> _currentStroke = [];
  bool _isProcessing = false;
  String? _uploadError;
  final GlobalKey _canvasKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = now.month;
    _year = now.year;
  }

  @override
  void dispose() {
    _pflegepersonController.dispose();
    super.dispose();
  }

  String get _monthLabel => '${_monthNames[_month - 1]} $_year';
  String get _documentTitle => 'Verhinderungspflege $_monthLabel';

  Future<void> _pickMonth() async {
    final result = await showDialog<Map<String, int>>(
      context: context,
      builder: (_) => _MonthYearPickerDialog(month: _month, year: _year),
    );
    if (result != null) {
      setState(() {
        _month = result['month']!;
        _year = result['year']!;
      });
    }
  }

  void _continueToSign() {
    final name = _pflegepersonController.text.trim();
    if (name.isEmpty) {
      setState(
        () => _pflegepersonError = 'Bitte Name der Pflegeperson eintragen',
      );
      return;
    }
    setState(() {
      _pflegepersonError = null;
      _step = _Step.sign;
    });
  }

  Future<void> _markNotWanted() async {
    // Kurzer Confirmation-Dialog
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Nicht gewünscht?'),
        content: Text(
          'Dadurch wird vermerkt dass ${widget.patient.displayName} '
          'keine Verhinderungspflege wünscht. Dieser Hinweis erscheint '
          'anschließend auf dem Patientenprofil.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Abbrechen'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Bestätigen'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _markingNotWanted = true);

    try {
      // Wir nutzen einen vereinfachten SVG als Platzhalter – das Backend
      // erwartet ein SVG, aber der signer_name markiert es als "not wanted".
      const placeholderSvg =
          '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="transparent"/></svg>';
      await ref.read(signatureRepositoryProvider).createSignature(
            patientId: widget.patient.patientId,
            documentType: DocumentType.vpAntrag,
            signerName: 'Nicht gewünscht',
            svgContent: placeholderSvg,
            note: 'Patient wünscht keine Verhinderungspflege',
          );
      ref.invalidate(mySignaturesProvider);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vermerkt: Patient wünscht keine Verhinderungspflege'),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _markingNotWanted = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.message),
          backgroundColor: Colors.red,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _markingNotWanted = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _onPanStart(DragStartDetails d) {
    setState(() => _currentStroke = [d.localPosition]);
  }

  void _onPanUpdate(DragUpdateDetails d) {
    setState(() => _currentStroke = [..._currentStroke, d.localPosition]);
  }

  void _onPanEnd(DragEndDetails _) {
    if (_currentStroke.isNotEmpty) {
      setState(() {
        _strokes.add(List.from(_currentStroke));
        _currentStroke = [];
      });
    }
  }

  void _clearSignature() {
    setState(() {
      _strokes.clear();
      _currentStroke = [];
    });
  }

  Future<void> _submit() async {
    if (_strokes.isEmpty && _currentStroke.isEmpty) {
      setState(() => _uploadError = 'Bitte zuerst unterschreiben.');
      return;
    }
    // Qualitäts-Check: min 2 Strokes, min 25 Points, min 60x25 Bounding-Box
    if (_strokes.length < 2) {
      setState(() => _uploadError =
          'Bitte mit vollständigem Namen unterschreiben — ein einzelner Strich reicht nicht.');
      return;
    }
    final totalPoints =
        _strokes.fold<int>(0, (sum, s) => sum + s.length);
    if (totalPoints < 25) {
      setState(() => _uploadError =
          'Unterschrift ist zu kurz. Bitte erneut und vollständig unterschreiben.');
      return;
    }
    double minX = double.infinity;
    double maxX = -double.infinity;
    double minY = double.infinity;
    double maxY = -double.infinity;
    for (final s in _strokes) {
      for (final p in s) {
        if (p.dx < minX) minX = p.dx;
        if (p.dx > maxX) maxX = p.dx;
        if (p.dy < minY) minY = p.dy;
        if (p.dy > maxY) maxY = p.dy;
      }
    }
    if ((maxX - minX) < 60 || (maxY - minY) < 25) {
      setState(() => _uploadError =
          'Unterschrift ist zu klein. Bitte den kompletten Bereich nutzen und erneut unterschreiben.');
      return;
    }

    setState(() {
      _isProcessing = true;
      _uploadError = null;
    });

    final renderBox =
        _canvasKey.currentContext?.findRenderObject() as RenderBox?;
    final size = renderBox?.size ?? const Size(400, 260);
    final svg = SvgBuilder.buildSignatureSvg(
      strokes: _strokes,
      canvasSize: size,
    );

    try {
      await ref.read(signatureRepositoryProvider).createSignature(
            patientId: widget.patient.patientId,
            documentType: DocumentType.vpAntrag,
            signerName: _pflegepersonController.text.trim(),
            svgContent: svg,
            width: size.width.round(),
            height: size.height.round(),
            note: 'VP-Antrag für $_monthLabel',
            infoTextVersion: 'dsgvo-consent-v1',
          );

      if (!mounted) return;
      setState(() {
        _isProcessing = false;
        _step = _Step.success;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _isProcessing = false;
        _uploadError = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isProcessing = false;
        _uploadError = 'Unerwarteter Fehler: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _step == _Step.form || _step == _Step.success,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _step == _Step.sign) {
          setState(() => _step = _Step.form);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(switch (_step) {
            _Step.form => 'Verhinderungspflege',
            _Step.sign => 'Unterschrift',
            _Step.success => 'Antrag eingereicht',
          }),
          leading: _step == _Step.sign
              ? IconButton(
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () => setState(() => _step = _Step.form),
                )
              : null,
          automaticallyImplyLeading: _step != _Step.sign,
        ),
        body: switch (_step) {
          _Step.form => _buildForm(),
          _Step.sign => _buildSign(),
          _Step.success => _buildSuccess(),
        },
      ),
    );
  }

  Widget _buildForm() {
    const green = Color(0xFF4F8A5B);

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.patient.displayName,
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: green.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'Pflegegrad ${widget.patient.pflegegradInt}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: green,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),

                const SizedBox(height: 24),

                _label('Monat des Antrags'),
                const SizedBox(height: 8),
                GestureDetector(
                  onTap: _pickMonth,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 16,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Colors.black12),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.calendar_month_outlined,
                          color: green,
                        ),
                        const SizedBox(width: 12),
                        Text(
                          _monthLabel,
                          style: const TextStyle(fontSize: 17),
                        ),
                        const Spacer(),
                        const Icon(
                          Icons.chevron_right,
                          color: Colors.black38,
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 20),

                _label('Name der Pflegeperson'),
                const SizedBox(height: 8),
                TextField(
                  controller: _pflegepersonController,
                  textCapitalization: TextCapitalization.words,
                  onChanged: (_) {
                    if (_pflegepersonError != null) {
                      setState(() => _pflegepersonError = null);
                    }
                  },
                  decoration: InputDecoration(
                    hintText: 'z.B. Anna Schmidt',
                    filled: true,
                    fillColor: Colors.white,
                    errorText: _pflegepersonError,
                    prefixIcon: const Icon(Icons.person_outline),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none,
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: Colors.black12),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: green, width: 1.5),
                    ),
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.only(left: 4, top: 6),
                  child: Text(
                    'Die Person, die den Patienten vertretungsweise betreut.',
                    style: TextStyle(fontSize: 13, color: Colors.black45),
                  ),
                ),

                const SizedBox(height: 24),

                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.blue.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: Colors.blue.withValues(alpha: 0.3),
                    ),
                  ),
                  child: const Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.info_outline, color: Colors.blue, size: 22),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Nach der Unterschrift wird der Antrag automatisch an die Krankenkasse zur Genehmigung gesendet.',
                          style: TextStyle(fontSize: 14, height: 1.4),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton.icon(
              onPressed: _markingNotWanted ? null : _continueToSign,
              icon: const Icon(Icons.arrow_forward),
              label: const Text(
                'Weiter zur Unterschrift',
                style: TextStyle(fontSize: 17),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: green,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
          child: SizedBox(
            width: double.infinity,
            height: 46,
            child: OutlinedButton.icon(
              onPressed: _markingNotWanted ? null : _markNotWanted,
              icon: _markingNotWanted
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.block, size: 18),
              label: const Text(
                'Patient wünscht keine Verhinderungspflege',
                style: TextStyle(fontSize: 14),
              ),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.black54,
                side: BorderSide(color: Colors.black.withValues(alpha: 0.2)),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSign() {
    const green = Color(0xFF4F8A5B);
    final isEmpty = _strokes.isEmpty && _currentStroke.isEmpty;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _documentTitle,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            '${widget.patient.displayName}  •  Pflegeperson: ${_pflegepersonController.text.trim()}',
            style: const TextStyle(fontSize: 14, color: Colors.black54),
          ),
          const SizedBox(height: 6),
          Text(
            'Mit der Unterschrift bestätigt der Patient den VP-Antrag und '
            'willigt in die Verarbeitung der Daten zur Abrechnung mit der '
            'Pflegekasse ein.',
            style: TextStyle(
              fontSize: 11,
              color: Colors.black.withValues(alpha: 0.6),
              height: 1.35,
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(
                  color: isEmpty ? Colors.black26 : green,
                  width: isEmpty ? 1 : 1.5,
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: Stack(
                  children: [
                    GestureDetector(
                      onPanStart: _onPanStart,
                      onPanUpdate: _onPanUpdate,
                      onPanEnd: _onPanEnd,
                      child: CustomPaint(
                        key: _canvasKey,
                        painter: _SignaturePainter(
                          strokes: _strokes,
                          currentStroke: _currentStroke,
                        ),
                        child: const SizedBox.expand(),
                      ),
                    ),
                    if (isEmpty)
                      const Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.draw_outlined,
                              size: 48,
                              color: Colors.black26,
                            ),
                            SizedBox(height: 10),
                            Text(
                              'Patient unterschreibt hier',
                              style: TextStyle(
                                fontSize: 17,
                                color: Colors.black38,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          if (_uploadError != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.red.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.red.withValues(alpha: 0.4)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.error_outline,
                      color: Colors.red, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _uploadError!,
                      style:
                          const TextStyle(color: Colors.red, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: isEmpty ? null : _clearSignature,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Zurücksetzen'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _isProcessing ? null : _submit,
                  icon: _isProcessing
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send),
                  label: const Text('Einreichen'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: green,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSuccess() {
    const green = Color(0xFF4F8A5B);
    final now = DateTime.now();
    final todayStr =
        '${now.day.toString().padLeft(2, '0')}.${now.month.toString().padLeft(2, '0')}.${now.year}';

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                const SizedBox(height: 20),
                Container(
                  width: 110,
                  height: 110,
                  decoration: BoxDecoration(
                    color: green.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.check_circle,
                    size: 76,
                    color: green,
                  ),
                ),
                const SizedBox(height: 24),
                const Text(
                  'Antrag unterschrieben',
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Der Verhinderungspflege-Antrag für\n$_monthLabel wurde unterschrieben und wird jetzt an die Krankenkasse gesendet.',
                  style: const TextStyle(
                    fontSize: 15,
                    color: Colors.black54,
                    height: 1.5,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 28),

                Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.black12),
                  ),
                  child: Column(
                    children: [
                      _statusRow(
                        icon: Icons.draw,
                        title: 'Vom Patienten unterschrieben',
                        subtitle: 'Heute, $todayStr',
                        color: green,
                        done: true,
                      ),
                      const Divider(height: 1, indent: 56),
                      _statusRow(
                        icon: Icons.send_outlined,
                        title: 'An Krankenkasse gesendet',
                        subtitle: 'Wird übermittelt',
                        color: Colors.blue,
                        done: true,
                      ),
                      const Divider(height: 1, indent: 56),
                      _statusRow(
                        icon: Icons.hourglass_empty,
                        title: 'Genehmigung',
                        subtitle: 'Ausstehend',
                        color: Colors.orange,
                        done: false,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
          child: SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton(
              onPressed: () => Navigator.of(context).pop(true),
              style: ElevatedButton.styleFrom(
                backgroundColor: green,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text(
                'Fertig',
                style: TextStyle(fontSize: 17),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _label(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w600,
        color: Colors.black54,
      ),
    );
  }

  Widget _statusRow({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required bool done,
  }) {
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: color.withValues(alpha: 0.12),
        child: Icon(icon, color: color, size: 20),
      ),
      title: Text(
        title,
        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        subtitle,
        style: const TextStyle(fontSize: 13),
      ),
      trailing: done
          ? const Icon(Icons.check, color: Color(0xFF4F8A5B))
          : const Icon(Icons.schedule, color: Colors.orange),
    );
  }
}

class _MonthYearPickerDialog extends StatefulWidget {
  final int month;
  final int year;

  const _MonthYearPickerDialog({required this.month, required this.year});

  @override
  State<_MonthYearPickerDialog> createState() =>
      _MonthYearPickerDialogState();
}

class _MonthYearPickerDialogState extends State<_MonthYearPickerDialog> {
  late int _month;
  late int _year;

  @override
  void initState() {
    super.initState();
    _month = widget.month;
    _year = widget.year;
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);

    return AlertDialog(
      title: const Text('Monat wählen'),
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                  icon: const Icon(Icons.chevron_left),
                  onPressed: () => setState(() => _year--),
                ),
                Text(
                  '$_year',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.chevron_right),
                  onPressed: () => setState(() => _year++),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: List.generate(12, (i) {
                final monthNum = i + 1;
                final isSelected = monthNum == _month;
                return GestureDetector(
                  onTap: () => setState(() => _month = monthNum),
                  child: Container(
                    width: 72,
                    height: 40,
                    decoration: BoxDecoration(
                      color: isSelected ? green : Colors.transparent,
                      border: Border.all(
                        color: isSelected ? green : Colors.black26,
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Center(
                      child: Text(
                        _monthNames[i].substring(0, 3),
                        style: TextStyle(
                          color: isSelected ? Colors.white : Colors.black87,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Abbrechen'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop({
            'month': _month,
            'year': _year,
          }),
          child: const Text('OK'),
        ),
      ],
    );
  }
}

class _SignaturePainter extends CustomPainter {
  final List<List<Offset>> strokes;
  final List<Offset> currentStroke;

  const _SignaturePainter({
    required this.strokes,
    required this.currentStroke,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black87
      ..strokeWidth = 2.8
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    for (final stroke in strokes) {
      _drawStroke(canvas, stroke, paint);
    }
    if (currentStroke.isNotEmpty) {
      _drawStroke(canvas, currentStroke, paint);
    }
  }

  void _drawStroke(Canvas canvas, List<Offset> points, Paint paint) {
    if (points.isEmpty) return;
    if (points.length == 1) {
      canvas.drawCircle(
        points.first,
        1.4,
        paint..style = PaintingStyle.fill,
      );
      paint.style = PaintingStyle.stroke;
      return;
    }
    final path = Path()..moveTo(points[0].dx, points[0].dy);
    for (int i = 1; i < points.length; i++) {
      path.lineTo(points[i].dx, points[i].dy);
    }
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(_SignaturePainter old) => true;
}
