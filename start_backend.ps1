$env:JAVA_HOME = "C:\Program Files\JetBrains\IntelliJ IDEA 2025.3.2\jbr"
Set-Location "D:\GitRepo\seede-ai\backend"
& mvn spring-boot:run 2>&1 | Tee-Object -FilePath "D:\GitRepo\seede-ai\backend.log"
