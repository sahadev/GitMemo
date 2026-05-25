import com.android.build.api.dsl.ApplicationExtension
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.get

const val TASK_GROUP = "rust"

open class Config {
    lateinit var rootDirRel: String
}

open class RustPlugin : Plugin<Project> {
    private lateinit var config: Config

    override fun apply(project: Project) = with(project) {
        config = extensions.create("rust", Config::class.java)

        fun csvProperty(name: String, fallback: List<String>): List<String> =
            (findProperty(name) as? String)
                ?.split(',')
                ?.map { it.trim() }
                ?.filter { it.isNotEmpty() }
                ?.takeIf { it.isNotEmpty() }
                ?: fallback

        val defaultAbiList = listOf("arm64-v8a")
        val abiList = csvProperty("abiList", defaultAbiList)

        val defaultArchList = listOf("arm64")
        val archList = csvProperty("archList", defaultArchList)

        val targetsList = csvProperty("targetList", listOf("aarch64"))

        if (abiList.size != archList.size || archList.size != targetsList.size) {
            throw GradleException("abiList, archList, and targetList must have the same number of entries")
        }

        extensions.configure<ApplicationExtension> {
            @Suppress("UnstableApiUsage")
            flavorDimensions.add("abi")
            productFlavors {
                create("universal") {
                    dimension = "abi"
                    ndk {
                        abiFilters += abiList
                    }
                }
                archList.forEachIndexed { index, arch ->
                    create(arch) {
                        dimension = "abi"
                        ndk {
                            abiFilters.add(abiList[index])
                        }
                    }
                }
            }
        }

        afterEvaluate {
            for (profile in listOf("debug", "release")) {
                val profileCapitalized = profile.replaceFirstChar { it.uppercase() }
                val buildTask = tasks.maybeCreate(
                    "rustBuildUniversal$profileCapitalized",
                    DefaultTask::class.java
                ).apply {
                    group = TASK_GROUP
                    description = "Build dynamic library in $profile mode for all targets"
                }

                tasks["mergeUniversal${profileCapitalized}JniLibFolders"].dependsOn(buildTask)

                for (targetPair in targetsList.withIndex()) {
                    val targetName = targetPair.value
                    val targetArch = archList[targetPair.index]
                    val targetArchCapitalized = targetArch.replaceFirstChar { it.uppercase() }
                    val targetBuildTask = project.tasks.maybeCreate(
                        "rustBuild$targetArchCapitalized$profileCapitalized",
                        BuildTask::class.java
                    ).apply {
                        group = TASK_GROUP
                        description = "Build dynamic library in $profile mode for $targetArch"
                        rootDirRel = config.rootDirRel
                        target = targetName
                        release = profile == "release"
                    }

                    buildTask.dependsOn(targetBuildTask)
                    tasks["merge$targetArchCapitalized${profileCapitalized}JniLibFolders"].dependsOn(
                        targetBuildTask
                    )
                }
            }
        }
    }
}
