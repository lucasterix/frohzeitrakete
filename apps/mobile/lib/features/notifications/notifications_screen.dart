import 'package:flutter/material.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final List<Map<String, dynamic>> _notifications = [
    {
      'icon': Icons.school_outlined,
      'title': 'Neue Fortbildung verfügbar',
      'body': 'Am 20.04.2026 findet die Schulung „Demenz verstehen" statt.',
      'time': 'Heute, 09:12',
      'unread': true,
    },
    {
      'icon': Icons.description_outlined,
      'title': 'Leistungsnachweis erinnert',
      'body': 'Patient Nr. 1 – bitte unterschreiben lassen.',
      'time': 'Gestern',
      'unread': true,
    },
    {
      'icon': Icons.campaign_outlined,
      'title': 'Nachricht vom Büro',
      'body': 'Bitte Urlaubswünsche bis 30.04. einreichen.',
      'time': '11.04.2026',
      'unread': false,
    },
    {
      'icon': Icons.warning_amber_outlined,
      'title': 'Versicherungsnummer fehlt',
      'body': 'Patient Nr. 1 – bitte im Büro nachfragen.',
      'time': '10.04.2026',
      'unread': false,
    },
  ];

  int get _unreadCount =>
      _notifications.where((n) => n['unread'] as bool).length;

  void _markAllRead() {
    setState(() {
      for (final n in _notifications) {
        n['unread'] = false;
      }
    });
  }

  void _markRead(int index) {
    if (!(_notifications[index]['unread'] as bool)) return;
    setState(() {
      _notifications[index]['unread'] = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);
    final unreadCount = _unreadCount;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Benachrichtigungen'),
        actions: [
          TextButton(
            onPressed: unreadCount == 0 ? null : _markAllRead,
            child: const Text('Alle gelesen'),
          ),
        ],
      ),
      body: _notifications.isEmpty
          ? const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.notifications_off_outlined,
                    size: 64,
                    color: Colors.black26,
                  ),
                  SizedBox(height: 16),
                  Text(
                    'Keine Benachrichtigungen',
                    style: TextStyle(fontSize: 16, color: Colors.black54),
                  ),
                ],
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              itemCount: _notifications.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final n = _notifications[index];
                final unread = n['unread'] as bool;

                return Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: unread
                          ? green.withValues(alpha: 0.4)
                          : Colors.black12,
                      width: unread ? 1.3 : 1,
                    ),
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    leading: CircleAvatar(
                      backgroundColor: green.withValues(alpha: 0.12),
                      child: Icon(n['icon'] as IconData, color: green),
                    ),
                    title: Row(
                      children: [
                        Expanded(
                          child: Text(
                            n['title'] as String,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: unread
                                  ? FontWeight.bold
                                  : FontWeight.w500,
                            ),
                          ),
                        ),
                        if (unread)
                          Container(
                            width: 9,
                            height: 9,
                            decoration: const BoxDecoration(
                              color: green,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            n['body'] as String,
                            style: const TextStyle(fontSize: 14),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            n['time'] as String,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.black45,
                            ),
                          ),
                        ],
                      ),
                    ),
                    onTap: () => _markRead(index),
                  ),
                );
              },
            ),
    );
  }
}
