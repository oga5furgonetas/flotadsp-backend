import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import '../theme/app_theme.dart';

/// Imagen de red que añade automáticamente el token Bearer del usuario. Útil
/// para las fotos de inspecciones servidas por el backend detrás de auth.
///
/// Estados: placeholder mientras carga el token o los bytes, e icono
/// `broken_image` si la descarga falla (URL rota, sin permisos, etc.).
class AuthedImage extends ConsumerWidget {
  const AuthedImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
  });

  final String url;
  final BoxFit fit;
  final double? width;
  final double? height;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final borderColor = Theme.of(context).extension<AppColors>()!.border;

    if (url.isEmpty) return _placeholder(borderColor);

    final headersAsync = ref.watch(authHeadersProvider);
    return headersAsync.when(
      loading: () => _placeholder(borderColor),
      error: (_, _) => _placeholder(borderColor),
      data: (headers) => Image.network(
        url,
        fit: fit,
        width: width,
        height: height,
        headers: headers.isEmpty ? null : headers,
        gaplessPlayback: true,
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return Container(
            width: width,
            height: height,
            color: borderColor,
            alignment: Alignment.center,
            child: const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2.2, color: AppTheme.brand),
            ),
          );
        },
        errorBuilder: (context, error, stack) => Container(
          width: width,
          height: height,
          color: borderColor,
          alignment: Alignment.center,
          child: const Icon(Icons.broken_image_rounded, color: Colors.white54, size: 32),
        ),
      ),
    );
  }

  Widget _placeholder(Color color) => Container(
        width: width,
        height: height,
        color: color,
      );
}
