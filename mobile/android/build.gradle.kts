allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// file_picker/image_picker (vía flutter_plugin_android_lifecycle) exigen compilar
// contra la API 36. Los módulos de plugin heredan la compileSdk por defecto de
// Flutter (34), así que la forzamos a 36 en todos ellos. No afecta a
// targetSdk/minSdk (comportamiento en tiempo de ejecución ni compatibilidad).
subprojects {
    val forceCompileSdk = {
        extensions.findByType(com.android.build.api.dsl.CommonExtension::class.java)?.let { android ->
            if ((android.compileSdk ?: 0) < 36) {
                android.compileSdk = 36
            }
        }
    }
    // :app ya está evaluado (evaluationDependsOn arriba): configurar al momento.
    if (state.executed) forceCompileSdk() else afterEvaluate { forceCompileSdk() }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
