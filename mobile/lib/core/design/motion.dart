import 'package:flutter/widgets.dart';
import 'package:flutter_animate/flutter_animate.dart';

/// Animaciones de entrada coherentes en toda la app: un único origen de verdad
/// para que todas las pantallas «respiren» igual (fade + leve deslizamiento).
extension AppMotion on Widget {
  /// Entrada premium. `index` escalona la aparición en listas/grids.
  Widget entrance({int index = 0, Duration? duration, double dy = 0.08}) {
    final d = duration ?? 380.ms;
    return animate(delay: (index * 55).ms)
        .fadeIn(duration: d)
        .slideY(begin: dy, end: 0, duration: d, curve: Curves.easeOutCubic);
  }
}
