import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Pestaña activa del shell (0 Resumen · 1 Flota · 2 Revisión · 3 Más).
/// Vive en su propio archivo para que cualquier pantalla pueda navegar a una
/// pestaña (p. ej. tocar una tarjeta del resumen) sin importar el shell entero.
final homeTabProvider = StateProvider<int>((ref) => 0);
