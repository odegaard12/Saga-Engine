import ast

def analyze():
    tree = ast.parse(open("main.py", encoding="utf-8").read())
    routes = []
    functions = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
            # Check decorators
            is_route = False
            for dec in node.decorator_list:
                if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute) and getattr(dec.func.value, "id", "") == "app":
                    is_route = True
                elif isinstance(dec, ast.Attribute) and getattr(dec.value, "id", "") == "app":
                    is_route = True
            if is_route:
                routes.append((node.name, node.lineno))
            else:
                functions.append((node.name, node.lineno))
    print(f"Total Routes: {len(routes)}")
    for name, line in routes:
        print(f"Route: {name} at line {line}")
    print(f"\nTotal Regular Functions: {len(functions)}")
    for name, line in functions:
        print(f"Func: {name} at line {line}")

if __name__ == "__main__":
    analyze()
