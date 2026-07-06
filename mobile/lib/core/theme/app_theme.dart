import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Tema premium de FlotaDSP: claro y oscuro, Material 3, coherente con la marca
/// (naranja) y con la web. Un único origen de verdad para colores, tipografía y
/// componentes → jerarquía visual consistente en toda la app.
class AppTheme {
  const AppTheme._();

  // Paleta de marca (misma familia que la web).
  static const Color brand = Color(0xFFF97316); // orange-500
  static const Color brandDark = Color(0xFFEA6800);
  static const Color brandLight = Color(0xFFFB923C);

  // Semánticos.
  static const Color danger = Color(0xFFEF4444);
  static const Color warning = Color(0xFFF59E0B);
  static const Color success = Color(0xFF22C55E);
  static const Color info = Color(0xFF38BDF8);

  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    final surface = isDark ? const Color(0xFF0E1116) : Colors.white;
    final background = isDark ? const Color(0xFF080A0E) : const Color(0xFFF5F8FC);
    final onSurface = isDark ? const Color(0xFFEEF1F6) : const Color(0xFF0F172A);
    final muted = isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B);
    final border = isDark ? const Color(0x14FFFFFF) : const Color(0x14000000);

    final scheme = ColorScheme.fromSeed(
      seedColor: brand,
      brightness: brightness,
      primary: brand,
      surface: surface,
      error: danger,
    );

    final base = ThemeData(useMaterial3: true, brightness: brightness, colorScheme: scheme);

    return base.copyWith(
      scaffoldBackgroundColor: background,
      canvasColor: background,
      dividerColor: border,
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: _FadeThroughTransitions(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      }),
      textTheme: _textTheme(base.textTheme, onSurface, muted),
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(color: onSurface, fontSize: 18, fontWeight: FontWeight.w700),
        iconTheme: IconThemeData(color: onSurface),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: border),
        ),
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? const Color(0xFF13161B) : const Color(0xFFF1F5F9),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        hintStyle: TextStyle(color: muted),
        labelStyle: TextStyle(color: muted),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: brand, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: danger),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: brand,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      splashFactory: InkSparkle.splashFactory,
      extensions: <ThemeExtension<dynamic>>[
        AppColors(muted: muted, border: border, surface: surface, background: background),
      ],
    );
  }

  static TextTheme _textTheme(TextTheme base, Color onSurface, Color muted) {
    return GoogleFonts.interTextTheme(base)
        .apply(bodyColor: onSurface, displayColor: onSurface)
        .copyWith(
          headlineSmall: base.headlineSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.5),
          titleLarge: base.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          titleMedium: base.titleMedium?.copyWith(fontWeight: FontWeight.w600),
          bodySmall: base.bodySmall?.copyWith(color: muted),
          labelLarge: base.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        );
  }
}

/// Transición de página premium: fade + ligero desplazamiento hacia arriba.
class _FadeThroughTransitions extends PageTransitionsBuilder {
  const _FadeThroughTransitions();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position: Tween<Offset>(begin: const Offset(0, 0.03), end: Offset.zero).animate(curved),
        child: child,
      ),
    );
  }
}

/// Colores derivados no cubiertos por [ColorScheme] (texto atenuado, bordes…),
/// accesibles con `Theme.of(context).extension<AppColors>()`.
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.muted,
    required this.border,
    required this.surface,
    required this.background,
  });

  final Color muted;
  final Color border;
  final Color surface;
  final Color background;

  @override
  AppColors copyWith({Color? muted, Color? border, Color? surface, Color? background}) {
    return AppColors(
      muted: muted ?? this.muted,
      border: border ?? this.border,
      surface: surface ?? this.surface,
      background: background ?? this.background,
    );
  }

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    return AppColors(
      muted: Color.lerp(muted, other.muted, t)!,
      border: Color.lerp(border, other.border, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      background: Color.lerp(background, other.background, t)!,
    );
  }
}
