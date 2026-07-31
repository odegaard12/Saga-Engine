import json

with open('data/stages.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

story = [
    "Lograstes espertar ao Vixía no Facho, pero a guerra non rematou. A Néboa retrocedeu cara ao mar, fuxindo do Escudo de Luz. Pero foi unha vitoria temporal.",
    "A Néboa non se disipou: reagrupouse nas augas do Lago de Castiñeiras e está a crear un Eco — unha copia espectral do Vixía, corrompida e baleira. Se o Eco completa o seu ritual antes de que anoiteza, o Vixía quedará atrapado para sempre.",
    "A ascensión culmina no Vértice Xeodésico de Cotorredondo, o punto máis alto da ruta. Dende aquí, a Néboa pode ver todo o val, pero tamén expón a súa verdadeira magnitude ante os ollos de quen a desafía.",
    "Avanzando pola Senda do Silencio, as árbores están mudas e o vento non move as follas; a Néboa bloqueou os circuítos de comunicación do bosque.",
    "Este lugar parece normal, pero a realidade está deformada: as árbores crecen en espiral e as sombras apuntan na dirección equivocada, a piques de ser absorbidas polo outro plano.",
    "Máis arriba, dende o Mirador de Troia, podería verse todo o val, pero o horizonte está borrado pola presenza escura — non deixa ver onde termina o mundo real e onde comeza o dominio da Néboa.",
    "Máis adiante atópase a Mámoa do Rei, unha construción que ten miles de anos, cuxa enerxía ancestral está a ser usada pola Néboa como amplificador, tragando a calquera que intente resistir a corrente espectral.",
    "O Camiño da Costa revela ser das primeras zonas en caer baixo este control.",
    "Tras o descenso final, o camiño volve ao punto de orixe. No Lago, o Eco do Vixía agarda. A súa forma espectral trema sobre a auga, case completa. É o momento crítico para enfrontarse á copia corrompida, disolver o Eco e facer que o lago volva á calma para que o Vixía quede, por fin, libre.",
    "O camiño continúa cara ao Xardín Doutros Mundos. A Néboa comeza a disiparse, e a paz volve ao bosque."
]

for i in range(10):
    if i < len(data):
        data[i]['content'] = story[i]

with open('data/stages.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Updated stages.json!")
