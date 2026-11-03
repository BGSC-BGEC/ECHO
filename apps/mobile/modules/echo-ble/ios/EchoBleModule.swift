import ExpoModulesCore

// ponytail: iOS can't put service data in a background advertisement, so Slash is Android-only for now; iPhones use the catch code.
public class EchoBleModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EchoBle")
    Function("state") { return "unsupported" }
    Function("canAdvertise") { return false }
    AsyncFunction("startAdvertising") { (_: String) in throw Exception(name: "E_UNSUPPORTED", description: "Slash isn't available on iPhone yet") }
    AsyncFunction("stopAdvertising") { }
    AsyncFunction("scan") { (_: Int) -> [[String: Any]] in throw Exception(name: "E_UNSUPPORTED", description: "Slash isn't available on iPhone yet") }
  }
}
