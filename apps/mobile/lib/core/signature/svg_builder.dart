import 'package:flutter/material.dart';

/// Konvertiert gezeichnete Strokes aus dem Signature-Canvas zu einem SVG-String,
/// den das Backend erwartet (muss mit `<svg` beginnen).
class SvgBuilder {
  static String buildSignatureSvg({
    required List<List<Offset>> strokes,
    required Size canvasSize,
    double strokeWidth = 2.8,
  }) {
    final buffer = StringBuffer();
    final width = canvasSize.width.round();
    final height = canvasSize.height.round();

    buffer.writeln(
      '<svg xmlns="http://www.w3.org/2000/svg" width="$width" height="$height" viewBox="0 0 $width $height">',
    );
    buffer.writeln(
      '<g fill="none" stroke="#222222" stroke-width="$strokeWidth" stroke-linecap="round" stroke-linejoin="round">',
    );

    for (final stroke in strokes) {
      if (stroke.isEmpty) continue;

      if (stroke.length == 1) {
        // Einzelner Punkt → kleiner Kreis
        final p = stroke.first;
        buffer.writeln(
          '<circle cx="${_fmt(p.dx)}" cy="${_fmt(p.dy)}" r="${strokeWidth / 2}" fill="#222222" />',
        );
        continue;
      }

      // Mehrfach-Punkt → Path mit M/L Befehlen
      buffer.write('<path d="M ${_fmt(stroke[0].dx)} ${_fmt(stroke[0].dy)}');
      for (int i = 1; i < stroke.length; i++) {
        buffer.write(' L ${_fmt(stroke[i].dx)} ${_fmt(stroke[i].dy)}');
      }
      buffer.writeln('" />');
    }

    buffer.writeln('</g>');
    buffer.writeln('</svg>');
    return buffer.toString();
  }

  static String _fmt(double v) => v.toStringAsFixed(1);
}
