import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Vollbild-Dialog der den User auffordert die App zu aktualisieren.
///
/// Wenn [forceUpdate] true ist gibt es keinen "Später"-Button —
/// der User muss updaten.
class UpdateDialog extends StatelessWidget {
  const UpdateDialog({
    super.key,
    required this.message,
    required this.iosUrl,
    required this.androidUrl,
    this.forceUpdate = false,
  });

  final String message;
  final String iosUrl;
  final String androidUrl;
  final bool forceUpdate;

  /// Zeigt den Dialog. Gibt `true` zurück wenn "Später" gedrückt wurde,
  /// `false` / `null` sonst (z.B. bei force-update bleibt er offen).
  static Future<bool?> show(
    BuildContext context, {
    required String message,
    required String iosUrl,
    required String androidUrl,
    bool forceUpdate = false,
  }) {
    return showDialog<bool>(
      context: context,
      barrierDismissible: !forceUpdate,
      builder: (_) => UpdateDialog(
        message: message,
        iosUrl: iosUrl,
        androidUrl: androidUrl,
        forceUpdate: forceUpdate,
      ),
    );
  }

  Future<void> _openStore() async {
    final url = Platform.isIOS ? iosUrl : androidUrl;
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !forceUpdate,
      child: AlertDialog(
        title: const Text('Update verfügbar'),
        content: Text(message),
        actions: [
          if (!forceUpdate)
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Später'),
            ),
          FilledButton(
            onPressed: _openStore,
            child: const Text('Jetzt aktualisieren'),
          ),
        ],
      ),
    );
  }
}
