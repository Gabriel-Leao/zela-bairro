| Imagem | O que é e condição | Texto real | OCR sem pré-processamento | Variante escolhida | OCR escolhido | Palavras certas | Resultado |
|---|---|---|---|---|---|---|---|
| 01_pare_boa_luz.png | Boa luz, letra clara em fundo vermelho | PARE | sem leitura | Adaptativa larga + limpeza | 97% “PARE” | 100% (direto 0%) | Sim |
| 02_ruido_sal_pimenta.png | Ruído sal e pimenta (4%) | PROIBIDO ESTACIONAR | sem leitura | Otsu + limpeza | 96% “PROIBIDO ESTACIONAR” | 100% (direto 0%) | Sim |
| 03_sombra.png | Iluminação irregular (gradiente) | PREFERENCIAL | 92% “FERENCIAL” | Centro + iluminação normalizada | 96% “REFERENCIAL” | 0% (direto 0%) | Não |
| 04_baixo_contraste.png | Baixo contraste e desfoque | SIGA EM FRENTE | sem leitura | , | sem leitura | 0% (direto 0%) | Não (incerta, manual) |
| 05_inclinada_letra_clara.png | Inclinada 4°, letra clara | TRAVESSIA ESCOLAR | 96% “TRAVESSIA ESCOLAR” | Adaptativa larga + limpeza | 97% “TRAVESSIA ESCOLAR” | 100% (direto 100%) | Sim |
| 06_ruido_gaussiano.png | Ruído gaussiano forte (σ=38) | VELOCIDADE MAXIMA 40 | 91% “VELOCIDADE MAXIMA 40” | Otsu + limpeza | 96% “VELOCIDADE MAXIMA 40” | 100% (direto 100%) | Sim |
