import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Imagen de red cacheada con placeholder y fallback consistentes.
class AppNetworkImage extends StatelessWidget {
  const AppNetworkImage({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.radius = 0,
  });

  final String url;
  final double? width;
  final double? height;
  final BoxFit fit;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).extension<AppColors>()!;
    final image = CachedNetworkImage(
      imageUrl: url,
      width: width,
      height: height,
      fit: fit,
      placeholder: (_, _) => Container(color: c.border),
      errorWidget: (_, _, _) => Container(
        color: c.border,
        alignment: Alignment.center,
        child: Icon(Icons.broken_image_outlined, color: c.muted, size: 22),
      ),
    );
    if (radius <= 0) return image;
    return ClipRRect(borderRadius: BorderRadius.circular(radius), child: image);
  }
}
