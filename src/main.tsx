import { render } from "solid-js/web";
import { App } from "./ui/App";
import "./ui/styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element");
render(() => <App />, root);
