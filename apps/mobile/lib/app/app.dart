import 'package:flutter/material.dart';
import '../features/auth/login_screen.dart';

class CareApp extends StatelessWidget {
  const CareApp({super.key});

  @override
  Widget build(BuildContext context) {
    const primaryGreen = Color(0xFF4F8A5B);
    const lightBackground = Color(0xFFF6F3F7);

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'FrohZeit',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: lightBackground,
        colorScheme: ColorScheme.fromSeed(
          seedColor: primaryGreen,
          brightness: Brightness.light,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: lightBackground,
          foregroundColor: Colors.black87,
          elevation: 0,
          centerTitle: false,
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
        ),
      ),
      home: const LoginScreen(),
    );
  }
}
