import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/models/mobile_patient.dart';
import '../../core/models/signature_event.dart';
import '../../core/providers.dart';
import '../../core/signature/svg_builder.dart';

enum _Step { list, sign, success }

class PflegehmScreen extends ConsumerStatefulWidget {
  final MobilePatient patient;

  const PflegehmScreen({super.key, required this.patient});

  @override
  ConsumerState<PflegehmScreen> createState() => _PflegehmScreenState();
}

class _PflegehmScreenState extends ConsumerState<PflegehmScreen> {
  _Step _step = _Step.list;
  bool _isProcessing = false;
  String? _error;
  final List<List<Offset>> _strokes = [];
  List<Offset> _currentStroke = [];
  final GlobalKey _canvasKey = GlobalKey();

  Future<void> _submitSignature() async {
    if (_strokes.isEmpty) {
      setState(() => _error = 'Bitte unterschreiben');
      return;
    }

    setState(() {
      _isProcessing = true;
      _error = null;
    });

    try {
      final renderBox = _canvasKey.currentContext?.findRenderObject() as RenderBox?;
      final canvasSize = renderBox?.size ?? const Size(400, 160);
      final svgContent = SvgBuilder.buildSignatureSvg(
        strokes: _strokes,
        canvasSize: canvasSize,
      );

      await ref.read(signatureRepositoryProvider).createSignature(
            patientId: widget.patient.patientId,
            documentType: DocumentType.pflegeantragHilfsmittel,
            signerName: widget.patient.displayName,
            svgContent: svgContent,
            note: 'Pflegehilfsmittel-Antrag unterschrieben',
          );

      ref.invalidate(mySignaturesProvider);
      ref.invalidate(patientSignaturesProvider(widget.patient.patientId));

      if (!mounted) return;
      setState(() => _step = _Step.success);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Fehler: $e');
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  void _clearSignature() {
    setState(() {
      _strokes.clear();
      _currentStroke = [];
    });
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pflegehilfsmittel'),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
        elevation: 0,
      ),
      body: SafeArea(
        child: _step == _Step.success
            ? _buildSuccess()
            : _step == _Step.sign
                ? _buildSignature(green)
                : _buildList(green),
      ),
    );
  }

  Widget _buildList(Color green) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Patient-Info
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.black12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.patient.displayName,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Pflegegrad ${widget.patient.pflegegradInt}',
                  style: TextStyle(
                    fontSize: 13,
                    color: green,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          const Text(
            'Pflegehilfsmittel-Antrag',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          const Text(
            'Der Patient bestätigt mit seiner Unterschrift den monatlichen '
            'Empfang der Pflegehilfsmittel (z.B. Einmalhandschuhe, Bettschutzeinlagen).',
            style: TextStyle(fontSize: 13, color: Colors.black54),
          ),
          const SizedBox(height: 24),

          // Button zur Unterschrift
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => setState(() => _step = _Step.sign),
              icon: const Icon(Icons.draw_outlined),
              label: const Text('Pflegeantrag unterschreiben'),
              style: ElevatedButton.styleFrom(
                backgroundColor: green,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSignature(Color green) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Unterschrift',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(
            '${widget.patient.displayName} unterschreibt hier:',
            style: const TextStyle(fontSize: 13, color: Colors.black54),
          ),
          const SizedBox(height: 16),

          if (_error != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red[50],
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.red[200]!),
              ),
              child: Text(
                _error!,
                style: TextStyle(fontSize: 13, color: Colors.red[800]),
              ),
            ),

          // Canvas
          Container(
            key: _canvasKey,
            width: double.infinity,
            height: 200,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.black26, width: 2),
            ),
            child: GestureDetector(
              onPanStart: (details) {
                setState(() {
                  _currentStroke = [details.localPosition];
                });
              },
              onPanUpdate: (details) {
                setState(() {
                  _currentStroke = [..._currentStroke, details.localPosition];
                });
              },
              onPanEnd: (_) {
                setState(() {
                  if (_currentStroke.length > 1) {
                    _strokes.add(List.from(_currentStroke));
                  }
                  _currentStroke = [];
                });
              },
              child: CustomPaint(
                painter: _SignaturePainter(
                  strokes: _strokes,
                  currentStroke: _currentStroke,
                ),
                size: Size.infinite,
              ),
            ),
          ),
          const SizedBox(height: 12),

          Row(
            children: [
              OutlinedButton(
                onPressed: _clearSignature,
                child: const Text('Loeschen'),
              ),
              const Spacer(),
              ElevatedButton(
                onPressed: _isProcessing ? null : _submitSignature,
                style: ElevatedButton.styleFrom(
                  backgroundColor: green,
                  foregroundColor: Colors.white,
                ),
                child: _isProcessing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Unterschrift bestaetigen'),
              ),
            ],
          ),

          const SizedBox(height: 16),
          TextButton(
            onPressed: () => setState(() => _step = _Step.list),
            child: const Text('Zurueck'),
          ),
        ],
      ),
    );
  }

  Widget _buildSuccess() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle_outline, size: 80, color: Color(0xFF4F8A5B)),
            const SizedBox(height: 20),
            const Text(
              'Erfolgreich unterschrieben!',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text(
              'Der Pflegehilfsmittel-Antrag wurde gespeichert.',
              style: TextStyle(fontSize: 14, color: Colors.black54),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(true),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF4F8A5B),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text('Fertig'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SignaturePainter extends CustomPainter {
  final List<List<Offset>> strokes;
  final List<Offset> currentStroke;

  _SignaturePainter({required this.strokes, required this.currentStroke});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    for (final stroke in strokes) {
      if (stroke.length < 2) continue;
      final path = Path()..moveTo(stroke[0].dx, stroke[0].dy);
      for (int i = 1; i < stroke.length; i++) {
        path.lineTo(stroke[i].dx, stroke[i].dy);
      }
      canvas.drawPath(path, paint);
    }

    if (currentStroke.length >= 2) {
      final path = Path()..moveTo(currentStroke[0].dx, currentStroke[0].dy);
      for (int i = 1; i < currentStroke.length; i++) {
        path.lineTo(currentStroke[i].dx, currentStroke[i].dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _SignaturePainter oldDelegate) => true;
}
