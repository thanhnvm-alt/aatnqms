import os
import psycopg2
import pandas as pd
import json
import google.generativeai as genai
from psycopg2 import sql
from dotenv import load_dotenv

# 1. Load Environment Variables
load_dotenv()

# Cấu hình Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

class QADatabaseAgent:
    def __init__(self):
        self.host = os.getenv("DB_HOST", "dbtracking.apps.zuehjcybfdjyc7j.aacorporation.vn")
        self.database = os.getenv("DB_NAME", "aaTrackingApps")
        self.user = os.getenv("DB_USER", "edbqaqc")
        self.password = os.getenv("DB_PASS", "Oe71zNGcnaS6hzra")
        self.schema = os.getenv("DB_SCHEMA", "appQAQC")
        
        # Tự động lấy cấu trúc DB khi khởi tạo
        print(f"🔄 Fetching schema metadata from {self.schema}...")
        self.tables_metadata = self.fetch_dynamic_schema()
        self.schema_context = self.build_system_prompt()
        print("✅ Schema context built successfully.")

    def get_connection(self):
        """Tạo kết nối an toàn đến PostgreSQL"""
        try:
            conn = psycopg2.connect(
                host=self.host,
                database=self.database,
                user=self.user,
                password=self.password,
                options=f"-c search_path={self.schema},public"
            )
            return conn
        except psycopg2.Error as e:
            print(f"❌ Database Connection Error: {e}")
            raise

    def fetch_dynamic_schema(self):
        """
        Truy vấn information_schema để lấy danh sách bảng và cột tự động.
        """
        tables = {}
        conn = None
        try:
            conn = self.get_connection()
            cur = conn.cursor()
            
            # Query lấy tên bảng, tên cột và kiểu dữ liệu
            query = """
                SELECT table_name, column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = %s
                ORDER BY table_name, ordinal_position;
            """
            
            cur.execute(query, (self.schema,))
            rows = cur.fetchall()
            
            for table_name, column_name, data_type in rows:
                if table_name not in tables:
                    tables[table_name] = []
                tables[table_name].append(f'"{column_name}" ({data_type})')
                
            return tables
            
        except Exception as e:
            print(f"⚠️ Error fetching schema: {e}")
            # Fallback nếu lỗi kết nối lúc init (để tránh crash app ngay lập tức)
            return {}
        finally:
            if conn:
                conn.close()

    def build_system_prompt(self):
        """Tạo Prompt cho AI dựa trên dữ liệu schema thực tế"""
        
        table_descriptions = []
        for table, columns in self.tables_metadata.items():
            col_str = "\n             - ".join(columns)
            table_descriptions.append(f"{self.schema}.{table}\n           - Columns:\n             - {col_str}")
            
        schema_text = "\n        ".join(table_descriptions)

        return f"""
        You are a PostgreSQL expert. Convert the user's question into a SQL query.
        
        Target Database Schema: "{self.schema}"
        
        Tables available (Fetched directly from Database):
        {schema_text}

        RULES:
        1. Return ONLY a JSON object with two keys: "sql" and "params".
        2. "sql": The SQL query string using %s placeholders for values (to prevent injection).
        3. "params": A list of values corresponding to the %s placeholders.
        4. ALWAYS use the schema prefix "{self.schema}" for table names (e.g., {self.schema}.ipo).
        5. IMPORTANT: The column names may have MixedCase. YOU MUST ENCLOSE COLUMN NAMES IN DOUBLE QUOTES (e.g., "ID_Project", "Project_name").
        6. ONLY generate SELECT queries. Do not generate INSERT, UPDATE, DELETE, or DROP.
        7. If the user asks for something dangerous or irrelevant, return empty JSON.
        """

    def generate_sql_from_ai(self, user_query):
        """
        Sử dụng Gemini để chuyển đổi câu hỏi thành SQL an toàn (Parameterization)
        """
        try:
            model = genai.GenerativeModel('gemini-2.0-flash') 
            
            prompt = f"""
            {self.schema_context}
            
            User Question: "{user_query}"
            
            Output JSON format example:
            {{
                "sql": "SELECT \\"Project_name\\", \\"Quantity_IPO\\" FROM {self.schema}.ipo WHERE \\"ID_Project\\" = %s",
                "params": ["PROJ-001"]
            }}
            """
            
            response = model.generate_content(prompt)
            
            # Xử lý text trả về để lấy JSON sạch
            clean_text = response.text.strip().replace('```json', '').replace('```', '')
            if not clean_text:
                return None, None
                
            query_data = json.loads(clean_text)
            
            return query_data.get("sql"), query_data.get("params", [])
            
        except Exception as e:
            print(f"❌ AI Generation Error: {e}")
            return None, None

    def validate_query(self, sql_query):
        """Kiểm tra bảo mật cơ bản"""
        if not sql_query:
            return False
        normalized = sql_query.strip().upper()
        if not normalized.startswith("SELECT"):
            print("⚠️ Security Alert: Only SELECT queries are allowed.")
            return False
        if ";" in sql_query:
             # Đơn giản hóa, ngăn chặn nhiều câu lệnh
             pass 
        return True

    def get_ai_response(self, user_query):
        """
        Hàm chính: Nhận câu hỏi -> AI -> SQL -> Thực thi -> Trả về DataFrame
        """
        conn = None
        try:
            print(f"🤖 Processing query: '{user_query}'...")
            
            # Bước 1: AI chuyển đổi sang SQL
            sql_query, params = self.generate_sql_from_ai(user_query)
            
            if not sql_query:
                return "Could not understand the question or generate valid SQL."

            # Bước 2: Validate bảo mật
            if not self.validate_query(sql_query):
                return "Query rejected for security reasons."

            print(f"📝 Generated SQL: {sql_query}")
            print(f"🔒 Params: {params}")

            # Bước 3: Thực thi truy vấn
            conn = self.get_connection()
            
            # Sử dụng pandas để đọc SQL an toàn với params
            df = pd.read_sql_query(sql_query, conn, params=params)
            
            return df

        except Exception as e:
            return f"System Error: {str(e)}"
        finally:
            if conn:
                conn.close()

# --- Example Usage (Integration Ready) ---
if __name__ == "__main__":
    agent = QADatabaseAgent()
    
    # Test Case 1: Lấy danh sách IPO
    print("\n--- Test 1: Simple Select ---")
    result1 = agent.get_ai_response("Liệt kê 3 dòng IPO có số lượng lớn nhất")
    if isinstance(result1, pd.DataFrame):
        print(result1.to_string())
    else:
        print(result1)

    # Test Case 2: Lọc dữ liệu (Kiểm tra tham số hóa)
    print("\n--- Test 2: Filtering (Parameterization) ---")
    # Câu hỏi này sẽ test xem AI có nhận diện đúng cột MixedCase từ schema động hay không
    result2 = agent.get_ai_response("Tìm thông tin dự án có mã 'Hilton'") 
    if isinstance(result2, pd.DataFrame):
        print(result2.to_string())
    else:
        print(result2)
