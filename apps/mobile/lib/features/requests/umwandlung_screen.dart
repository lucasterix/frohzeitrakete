import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/models/mobile_patient.dart';
import '../../core/models/signature_event.dart';
import '../../core/providers.dart';
import '../../core/signature/svg_builder.dart';

const List<String> _monthNames = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/// Umwandlungsantrag-Flow: Rechtstext anzeigen → Unterschrift.
///
/// Der Text ist pflichtend rechtlich formuliert:
///   "Hiermit beantrage ich die möglichen 40% Umwandlung meines
///   Pflegesachleistungsanspruches in Betreuungsleistungen nach § 36 SGB XI
///   an den FrohZeit, Hans-Böckler-Straße 2C, 37079.
///   Mir ist bewusst, dass sich dadurch das Pflegegeld verringert und später
///   gezahlt wird. Diese Regelung soll ab dem 01.{next_month}.{year} gelten."
///
/// Der "gültig ab"-Monat wird auf den Folgemonat des aktuellen Monats gesetzt.
class UmwandlungScreen extends ConsumerStatefulWidget {
  final MobilePatient patient;

  const UmwandlungScreen({super.key, required this.patient});

  @override
  ConsumerState<UmwandlungScreen> createState() => _UmwandlungScreenState();
}

enum _UmwandlungStep { intro, sign, success }

class _UmwandlungScreenState extends ConsumerState<UmwandlungScreen> {
  _UmwandlungStep _step = _UmwandlungStep.intro;
  final List<List<Offset>> _strokes = [];
  List<Offset> _currentStroke = [];
  bool _isProcessing = false;
  String? _error;
  final GlobalKey _canvasKey = GlobalKey();

  late DateTime _effectiveFrom;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _effectiveFrom = DateTime(now.year, now.month + 1, 1);
  }

  String get _effectiveFromLabel =>
      '01.${_effectiveFrom.month.toString().padLeft(2, '0')}.${_effectiveFrom.year}';

  String get _currentMonthLabel =>
      '${_monthNames[DateTime.now().month - 1]} ${DateTime.now().year}';

  String get _legalText =>
      'Hiermit beantrage ich die möglichen 40% Umwandlung meines '
      'Pflegesachleistungsanspruches in Betreuungsleistungen nach § 36 SGB XI '
      'an den\n\nFrohZeit\nHans-Böckler-Straße 2C\n37079\n\n'
      'Mir ist bewusst, dass sich dadurch das Pflegegeld verringert und später '
      'gezahlt wird.\n\n'
      'Diese Regelung soll ab den $_effectiveFromLabel gelten.';

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

  void _clear() {
    setState(() {
      _strokes.clear();
      _currentStroke = [];
      _error = null;
    });
  }

  bool get _isEmpty => _strokes.isEmpty && _currentStroke.isEmpty;

  Future<void> _submit() async {
    if (_isEmpty) {
      setState(() => _error = 'Bitte zuerst unterschreiben.');
      return;
    }

    final renderBox =
        _canvasKey.currentContext?.findRenderObject() as RenderBox?;
    final size = renderBox?.size ?? const Size(400, 260);
    final svg = SvgBuilder.buildSignatureSvg(
      strokes: _strokes,
      canvasSize: size,
    );

    setState(() {
      _isProcessing = true;
      _error = null;
    });

    try {
      await ref.read(signatureRepositoryProvider).createSignature(
            patientId: widget.patient.patientId,
            documentType: DocumentType.pflegeumwandlung,
            signerName: widget.patient.displayName,
            svgContent: svg,
            width: size.width.round(),
            height: size.height.round(),
            note: 'Umwandlungsantrag · gültig ab $_effectiveFromLabel · '
                'erfasst im $_currentMonthLabel',
          );
      ref.invalidate(mySignaturesProvider);
      if (!mounted) return;
      setState(() {
        _isProcessing = false;
        _step = _UmwandlungStep.success;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _isProcessing = false;
        _error = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isProcessing = false;
        _error = 'Unerwarteter Fehler: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _step != _UmwandlungStep.sign,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _step == _UmwandlungStep.sign) {
          setState(() => _step = _UmwandlungStep.intro);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(switch (_step) {
            _UmwandlungStep.intro => 'Umwandlungsantrag',
            _UmwandlungStep.sign => 'Unterschrift',
            _UmwandlungStep.success => 'Antrag eingereicht',
          }),
          leading: _step == _UmwandlungStep.sign
              ? IconButton(
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () => setState(() => _step = _UmwandlungStep.intro),
                )
              : null,
          automaticallyImplyLeading: _step != _UmwandlungStep.sign,
        ),
        body: switch (_step) {
          _UmwandlungStep.intro => _buildIntro(),
          _UmwandlungStep.sign => _buildSign(),
          _UmwandlungStep.success => _buildSuccess(),
        },
      ),
    );
  }

  Widget _buildIntro() {
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
                const SizedBox(height: 4),
                Text(
                  'Pflegegrad ${widget.patient.pflegegradInt}',
                  style: const TextStyle(
                    fontSize: 15,
                    color: Colors.black54,
                  ),
                ),

                const SizedBox(height: 24),

                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.black12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Antragstext',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Colors.black54,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        _legalText,
                        style: const TextStyle(
                          fontSize: 15,
                          height: 1.5,
                          color: Colors.black87,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.blue.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: Colors.blue.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.info_outline,
                          color: Colors.blue, size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Antrag erfasst im $_currentMonthLabel · '
                          'gültig ab $_effectiveFromLabel',
                          style: const TextStyle(fontSize: 13, height: 1.4),
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
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
          child: SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton.icon(
              onPressed: () {
                setState(() => _step = _UmwandlungStep.sign);
              },
              icon: const Icon(Icons.draw),
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
      ],
    );
  }

  Widget _buildSign() {
    const green = Color(0xFF4F8A5B);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Umwandlungsantrag',
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            widget.patient.displayName,
            style: const TextStyle(fontSize: 14, color: Colors.black54),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.black12),
            ),
            child: Text(
              _legalText,
              style: const TextStyle(fontSize: 12, height: 1.45, color: Colors.black87),
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(
                  color: _isEmpty ? Colors.black26 : green,
                  width: _isEmpty ? 1 : 1.5,
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
                    if (_isEmpty)
                      const Center(
                        child: Text(
                          'Patient unterschreibt hier',
                          style: TextStyle(
                            fontSize: 17,
                            color: Colors.black38,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(
              _error!,
              style: const TextStyle(color: Colors.red, fontSize: 13),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _isEmpty ? null : _clear,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Zurücksetzen'),
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
                  'Umwandlungsantrag unterschrieben',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Der Antrag wurde unterschrieben und wird jetzt vom Büro '
                  'weiterbearbeitet. Gültig ab $_effectiveFromLabel.',
                  style: const TextStyle(
                    fontSize: 15,
                    color: Colors.black54,
                    height: 1.5,
                  ),
                  textAlign: TextAlign.center,
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
              child: const Text('Fertig', style: TextStyle(fontSize: 17)),
            ),
          ),
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
      canvas.drawCircle(points.first, 1.4, paint..style = PaintingStyle.fill);
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
