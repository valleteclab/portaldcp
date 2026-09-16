from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


OUTPUT_DIR = Path(__file__).resolve().parents[1] / "demo-docs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="DemoBanner",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        textColor=colors.HexColor("#991B1B"),
        backColor=colors.HexColor("#FEE2E2"),
        borderColor=colors.HexColor("#EF4444"),
        borderWidth=0.8,
        borderPadding=7,
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        spaceAfter=14,
    )
)
styles.add(
    ParagraphStyle(
        name="DocTitle",
        parent=styles["Title"],
        alignment=TA_CENTER,
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=19,
        textColor=colors.HexColor("#172554"),
        spaceAfter=12,
    )
)
styles.add(
    ParagraphStyle(
        name="Section",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#1E3A8A"),
        spaceBefore=10,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="BodyJustify",
        parent=styles["BodyText"],
        alignment=TA_JUSTIFY,
        fontSize=9,
        leading=13,
        spaceAfter=7,
    )
)
styles.add(
    ParagraphStyle(
        name="Small",
        parent=styles["BodyText"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#475569"),
    )
)


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(colors.HexColor("#CBD5E1"))
    canvas.line(1.7 * cm, height - 1.35 * cm, width - 1.7 * cm, height - 1.35 * cm)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(colors.HexColor("#1E3A8A"))
    canvas.drawString(1.7 * cm, height - 1.05 * cm, "PORTAL DCP - DEMONSTRAÇÃO PNCP")
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#64748B"))
    canvas.drawRightString(width - 1.7 * cm, 1.05 * cm, f"Página {doc.page}")
    canvas.drawString(1.7 * cm, 1.05 * cm, "Documento fictício - sem validade jurídica")
    canvas.restoreState()


def paragraph(text):
    return Paragraph(text, styles["BodyJustify"])


def metadata_table(rows):
    data = [
        [Paragraph(f"<b>{label}</b>", styles["Small"]), Paragraph(value, styles["Small"])]
        for label, value in rows
    ]
    table = Table(data, colWidths=[4.2 * cm, 12.1 * cm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EFF6FF")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#94A3B8")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def item_table(headers, rows, widths):
    data = [[Paragraph(f"<b>{cell}</b>", styles["Small"]) for cell in headers]]
    data += [[Paragraph(str(cell), styles["Small"]) for cell in row] for row in rows]
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DBEAFE")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#64748B")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def build_document(filename, title, metadata, sections, tables=None):
    path = OUTPUT_DIR / filename
    doc = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        rightMargin=1.7 * cm,
        leftMargin=1.7 * cm,
        topMargin=1.75 * cm,
        bottomMargin=1.6 * cm,
        title=title,
        author="Portal DCP - Ambiente de Homologação",
    )
    story = [
        Spacer(1, 0.2 * cm),
        Paragraph(
            "AMBIENTE DE HOMOLOGAÇÃO - DOCUMENTO TOTALMENTE FICTÍCIO - SEM VALIDADE JURÍDICA",
            styles["DemoBanner"],
        ),
        Paragraph(title, styles["DocTitle"]),
        metadata_table(metadata),
        Spacer(1, 0.25 * cm),
    ]
    tables = tables or {}
    for heading, body in sections:
        story.append(Paragraph(heading, styles["Section"]))
        story.append(paragraph(body))
        if heading in tables:
            story.append(Spacer(1, 0.1 * cm))
            story.append(tables[heading])
    story.extend(
        [
            Spacer(1, 0.5 * cm),
            Paragraph(
                "<b>Declaração de demonstração:</b> nomes, números, CNPJs, valores, datas e demais informações "
                "deste arquivo foram criados exclusivamente para validação técnica do Portal DCP junto ao PNCP.",
                styles["Small"],
            ),
        ]
    )
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    return path


ORG = "ÓRGÃO MUNICIPAL DE DEMONSTRAÇÃO - DADOS FICTÍCIOS"
CNPJ_ORG = "99.999.999/0001-91"
FORNECEDOR = "FORNECEDOR DEMONSTRAÇÃO BRASIL LTDA."
CNPJ_FORN = "99.999.999/0001-02"

documents = []

documents.append(
    build_document(
        "edital-credenciamento-demo.pdf",
        "EDITAL DE CREDENCIAMENTO Nº CR-DEMO-001/2026",
        [
            ("Processo administrativo", "DEMO-PNCP-003/2026"),
            ("Órgão", f"{ORG} - CNPJ {CNPJ_ORG}"),
            ("Fundamento", "Art. 79 da Lei Federal nº 14.133/2021"),
            ("Publicação fictícia", "01/08/2026"),
        ],
        [
            ("1. Objeto", "Credenciamento fictício de pessoas jurídicas especializadas em serviços de manutenção preventiva de equipamentos administrativos, para atendimento sob demanda."),
            ("2. Participação", "Poderão participar empresas fictícias que atendam aos requisitos jurídicos, fiscais, trabalhistas, econômicos e técnicos definidos neste edital."),
            ("3. Inscrições", "As inscrições de demonstração permanecerão abertas de 01/08/2026 a 31/12/2026, exclusivamente para validação funcional do sistema."),
            ("4. Habilitação", "A documentação demonstrativa compreende cadastro empresarial, regularidade fiscal, qualificação técnica e declaração de inexistência de impedimentos."),
            ("5. Critério de distribuição", "As demandas fictícias serão distribuídas mediante rodízio objetivo entre os credenciados habilitados."),
        ],
    )
)

documents.append(
    build_document(
        "anexo-credenciamento-demo.pdf",
        "ANEXO I - REQUISITOS DO CREDENCIAMENTO FICTÍCIO",
        [
            ("Edital", "CR-DEMO-001/2026"),
            ("Processo", "DEMO-PNCP-003/2026"),
            ("Órgão", ORG),
        ],
        [
            ("1. Documentos exigidos", "Ato constitutivo, comprovante de inscrição, certidões simuladas, atestado fictício de capacidade técnica e declaração de concordância."),
            ("2. Especificação técnica", "Atendimento de chamados de baixa complexidade, registro eletrônico da execução e emissão de relatório demonstrativo."),
            ("3. Modelo de declaração", "A empresa declara ciência de que este procedimento e todos os seus documentos existem apenas para homologação técnica do Portal DCP."),
        ],
    )
)

documents.append(
    build_document(
        "aviso-contratacao-direta-demo.pdf",
        "AVISO DE CONTRATAÇÃO DIRETA Nº ACD-DEMO-001/2026",
        [
            ("Processo", "DEMO-PNCP-002/2026"),
            ("Órgão", f"{ORG} - CNPJ {CNPJ_ORG}"),
            ("Modalidade", "Dispensa eletrônica fictícia"),
            ("Valor estimado", "R$ 36.000,00"),
        ],
        [
            ("1. Objeto", "Contratação fictícia de serviço anual de manutenção preventiva de aparelhos de climatização, incluindo visitas técnicas e relatórios."),
            ("2. Recebimento de propostas", "Propostas demonstrativas entre 01/08/2026 e 05/08/2026. Não haverá contratação ou pagamento real."),
            ("3. Critério de julgamento", "Menor preço global, observados os requisitos técnicos do termo de referência fictício."),
            ("4. Fundamento", "Art. 75, inciso II, da Lei Federal nº 14.133/2021, utilizado somente como cenário de teste."),
        ],
    )
)

documents.append(
    build_document(
        "termo-referencia-contratacao-direta-demo.pdf",
        "TERMO DE REFERÊNCIA - CONTRATAÇÃO DIRETA FICTÍCIA",
        [
            ("Processo", "DEMO-PNCP-002/2026"),
            ("Aviso", "ACD-DEMO-001/2026"),
            ("Órgão", ORG),
        ],
        [
            ("1. Necessidade", "Simular no Portal DCP a publicação de aviso de contratação direta acompanhado de documento técnico."),
            ("2. Escopo", "Doze visitas mensais fictícias para inspeção, limpeza, testes e emissão de relatório em equipamentos de climatização."),
            ("3. Prazo", "Vigência demonstrativa de 12 meses, contada da assinatura do contrato fictício."),
            ("4. Medição", "A medição será mensal e dependerá de relatório demonstrativo aceito pelo fiscal fictício."),
        ],
        {
            "2. Escopo": item_table(
                ["Item", "Descrição", "Qtd.", "Valor unit.", "Total"],
                [["1", "Manutenção preventiva mensal", "12", "R$ 3.000,00", "R$ 36.000,00"]],
                [1.2 * cm, 7.2 * cm, 1.4 * cm, 3.0 * cm, 3.0 * cm],
            )
        },
    )
)

documents.append(
    build_document(
        "edital-pregao-eletronico-demo.pdf",
        "EDITAL DE PREGÃO ELETRÔNICO Nº PE-DEMO-001/2026",
        [
            ("Processo", "DEMO-PNCP-001/2026"),
            ("Órgão", f"{ORG} - CNPJ {CNPJ_ORG}"),
            ("Critério", "Menor preço por item"),
            ("Sistema", "Registro de preços fictício"),
            ("Valor estimado", "R$ 185.000,00"),
        ],
        [
            ("1. Objeto", "Registro de preços fictício para futura aquisição de computadores portáteis destinados exclusivamente à demonstração das funcionalidades do Portal DCP."),
            ("2. Sessão pública", "A sessão eletrônica demonstrativa está indicada para 10/08/2026, sem recebimento de propostas reais."),
            ("3. Proposta", "A proposta fictícia deverá informar marca, modelo, valor unitário e prazo de entrega demonstrativo."),
            ("4. Julgamento e habilitação", "Será utilizado o critério de menor preço, com verificação simulada dos documentos de habilitação."),
            ("5. Registro de preços", "O resultado fictício poderá originar ata de registro de preços de demonstração com vigência de 12 meses."),
        ],
    )
)

documents.append(
    build_document(
        "anexo-edital-pregao-demo.pdf",
        "ANEXO I - TERMO DE REFERÊNCIA DO PREGÃO FICTÍCIO",
        [
            ("Edital", "PE-DEMO-001/2026"),
            ("Processo", "DEMO-PNCP-001/2026"),
            ("Órgão", ORG),
        ],
        [
            ("1. Especificação", "Computador portátil fictício, processador de arquitetura atual, memória de 16 GB, armazenamento SSD de 512 GB, tela de 15 polegadas e garantia simulada de 36 meses."),
            ("2. Quantidade e estimativa", "A estimativa existe apenas para validar cálculos, publicação, anexos e geração de ata no ambiente de homologação."),
            ("3. Entrega", "Prazo demonstrativo de até 30 dias após a emissão de ordem fictícia."),
        ],
        {
            "2. Quantidade e estimativa": item_table(
                ["Item", "Descrição", "Qtd.", "Valor unit.", "Total"],
                [["1", "Computador portátil - configuração demonstrativa", "50 UN", "R$ 3.700,00", "R$ 185.000,00"]],
                [1.2 * cm, 7.2 * cm, 1.6 * cm, 3.0 * cm, 3.0 * cm],
            )
        },
    )
)

documents.append(
    build_document(
        "ata-registro-precos-demo.pdf",
        "ATA DE REGISTRO DE PREÇOS Nº ARP-DEMO-001/2026",
        [
            ("Processo", "DEMO-PNCP-001/2026"),
            ("Pregão", "PE-DEMO-001/2026"),
            ("Órgão gerenciador", ORG),
            ("Fornecedor fictício", f"{FORNECEDOR} - CNPJ {CNPJ_FORN}"),
            ("Valor registrado", "R$ 185.000,00"),
        ],
        [
            ("1. Objeto", "Registro fictício de preços para computadores portáteis de demonstração."),
            ("2. Vigência", "Doze meses fictícios, de 15/08/2026 a 14/08/2027."),
            ("3. Condições", "A existência desta ata não obriga qualquer aquisição e não produz efeitos jurídicos ou financeiros."),
        ],
        {
            "1. Objeto": item_table(
                ["Item", "Descrição", "Qtd.", "Valor unit.", "Total"],
                [["1", "Computador portátil fictício", "50 UN", "R$ 3.700,00", "R$ 185.000,00"]],
                [1.2 * cm, 7.2 * cm, 1.6 * cm, 3.0 * cm, 3.0 * cm],
            )
        },
    )
)

documents.append(
    build_document(
        "contrato-administrativo-demo.pdf",
        "CONTRATO ADMINISTRATIVO Nº CT-DEMO-001/2026",
        [
            ("Processo", "DEMO-PNCP-002/2026"),
            ("Contratante fictício", f"{ORG} - CNPJ {CNPJ_ORG}"),
            ("Contratada fictícia", f"{FORNECEDOR} - CNPJ {CNPJ_FORN}"),
            ("Valor inicial", "R$ 36.000,00"),
        ],
        [
            ("Cláusula primeira - Objeto", "Prestação fictícia de serviços mensais de manutenção preventiva de aparelhos de climatização."),
            ("Cláusula segunda - Vigência", "Vigência demonstrativa de 12 meses, de 10/08/2026 a 09/08/2027."),
            ("Cláusula terceira - Preço", "Valor global fictício de R$ 36.000,00, dividido em doze parcelas mensais de R$ 3.000,00."),
            ("Cláusula quarta - Fiscalização", "A execução simulada será acompanhada por fiscal fictício designado apenas para validação do fluxo do sistema."),
            ("Cláusula quinta - Publicação", "O instrumento será exibido publicamente no ambiente de homologação do Portal DCP."),
        ],
    )
)

documents.append(
    build_document(
        "termo-aditivo-demo.pdf",
        "1º TERMO ADITIVO FICTÍCIO AO CONTRATO CT-DEMO-001/2026",
        [
            ("Processo", "DEMO-PNCP-002/2026"),
            ("Contrato", "CT-DEMO-001/2026"),
            ("Tipo", "Acréscimo de valor fictício"),
            ("Percentual", "10,00%"),
            ("Valor do acréscimo", "R$ 3.600,00"),
            ("Novo valor global", "R$ 39.600,00"),
        ],
        [
            ("1. Finalidade", "Demonstrar a publicação integrada de termo aditivo e a atualização do valor global do contrato no Portal DCP."),
            ("2. Alteração", "O valor fictício do contrato passa de R$ 36.000,00 para R$ 39.600,00."),
            ("3. Ratificação", "Permanecem inalteradas as demais cláusulas do instrumento de demonstração."),
            ("4. Eficácia", "Este termo não possui validade jurídica e não representa obrigação entre partes reais."),
        ],
    )
)

for document in documents:
    print(document)
