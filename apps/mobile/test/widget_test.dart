import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/api/api_exception.dart';
import 'package:mobile/core/models/notification.dart';

void main() {
  group('AppNotification', () {
    test('parses unread notification from JSON', () {
      final n = AppNotification.fromJson({
        'id': 42,
        'kind': 'call_request_created',
        'title': 'Neue Rückruf-Anfrage',
        'body': 'Grund: termin',
        'related_patient_id': 7,
        'related_entity_id': 99,
        'read_at': null,
        'created_at': '2026-04-14T10:00:00',
      });
      expect(n.id, 42);
      expect(n.isUnread, true);
      expect(n.relatedPatientId, 7);
    });

    test('parses read notification', () {
      final n = AppNotification.fromJson({
        'id': 1,
        'kind': 'training_new',
        'title': 'Neue Fortbildung',
        'body': null,
        'related_patient_id': null,
        'related_entity_id': null,
        'read_at': '2026-04-14T11:00:00',
        'created_at': '2026-04-14T10:00:00',
      });
      expect(n.isUnread, false);
      expect(n.readAt, isNotNull);
    });
  });

  group('ApiException', () {
    test('auth error flag', () {
      const e = ApiException(
        message: 'Bitte einloggen',
        statusCode: 401,
        isAuthError: true,
      );
      expect(e.isAuthError, true);
      expect(e.statusCode, 401);
    });
  });

  testWidgets('smoke: MaterialApp boots with ProviderScope',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: Scaffold(body: Text('FrohZeit Rakete')),
        ),
      ),
    );
    expect(find.text('FrohZeit Rakete'), findsOneWidget);
  });
}
