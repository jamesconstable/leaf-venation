import { render } from "solid-js/web";
import { App } from "./ui/App";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/eb-garamond/500.css";
import "@fontsource-variable/inter";
import "./ui/styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element");
render(() => <App />, root);
