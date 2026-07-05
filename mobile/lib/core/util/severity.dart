import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Estilo (etiqueta + color) de una severidad de daño. Único origen de verdad
/// para no duplicar el mapeo por la app.
class SeverityStyle {
  const SeverityStyle(this.label, this.color);
  final String label;
  final Color color;

  static const _map = {
    'sin_danos': SeverityStyle('Sin daños', AppTheme.success),
    'leve': SeverityStyle('Leve', Color(0xFFFBBF24)),
    'moderado': SeverityStyle('Moderado', AppTheme.warning),
    'grave': SeverityStyle('Grave', Color(0xFFF87171)),
    'critico': SeverityStyle('Crítico', AppTheme.danger),
    'sin_analisis': SeverityStyle('Sin analizar', Color(0xFF94A3B8)),
  };

  static SeverityStyle of(String? severity) =>
      _map[severity] ?? const SeverityStyle('—', Color(0xFF94A3B8));
}
