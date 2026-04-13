import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class DetailLine extends StatelessWidget {
  final String label;
  final String value;
  final bool copyable;
  final IconData? icon;

  const DetailLine(
    this.label,
    this.value, {
    super.key,
    this.copyable = false,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final content = RichText(
      text: TextSpan(
        style: const TextStyle(
          fontSize: 18,
          color: Colors.black87,
          height: 1.4,
        ),
        children: [
          TextSpan(
            text: '$label ',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          TextSpan(
            text: value,
            style: TextStyle(
              color: copyable ? const Color(0xFF4F8A5B) : Colors.black87,
              decoration:
                  copyable ? TextDecoration.underline : TextDecoration.none,
              decorationColor: const Color(0xFF4F8A5B),
            ),
          ),
        ],
      ),
    );

    if (!copyable) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: content,
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () async {
          await Clipboard.setData(ClipboardData(text: value));
          if (!context.mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('$label in Zwischenablage kopiert'),
              duration: const Duration(seconds: 2),
            ),
          );
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              Expanded(child: content),
              if (icon != null) ...[
                const SizedBox(width: 8),
                Icon(icon, size: 18, color: const Color(0xFF4F8A5B)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
