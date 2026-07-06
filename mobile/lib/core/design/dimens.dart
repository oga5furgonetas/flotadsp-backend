import 'package:flutter/widgets.dart';

/// Escala de espaciado (múltiplos de 4). Un único origen de verdad para
/// márgenes y paddings coherentes en toda la app.
abstract final class Gap {
  static const xs = SizedBox(height: 4, width: 4);
  static const sm = SizedBox(height: 8, width: 8);
  static const md = SizedBox(height: 12, width: 12);
  static const lg = SizedBox(height: 16, width: 16);
  static const xl = SizedBox(height: 24, width: 24);

  static const h8 = SizedBox(height: 8);
  static const h12 = SizedBox(height: 12);
  static const h16 = SizedBox(height: 16);
  static const h20 = SizedBox(height: 20);
  static const h24 = SizedBox(height: 24);
  static const w8 = SizedBox(width: 8);
  static const w12 = SizedBox(width: 12);
}

/// Radios de esquina.
abstract final class Radii {
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const pill = 99.0;
}

/// Paddings de página estándar.
abstract final class Insets {
  static const page = EdgeInsets.all(16);
  static const card = EdgeInsets.all(16);
}
