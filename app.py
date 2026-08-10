import os
import json
import time
import sqlite3
import threading
import pyperclip
import webview
from pynput import keyboard

def init_db():
	con = sqlite3.connect("db/mappings.db")
	cursor = con.cursor()
	cursor.execute(
		"""
		CREATE TABLE IF NOT EXISTS mappings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			code_snippet TEXT UNIQUE,
			pdf_path TEXT,
			page_number INTEGER,
			rect_coords TEXT
		)
		"""
	)
	cursor.execute(
		"""
		INSERT OR IGNORE INTO mappings (code_snippet, pdf_path, page_number, rect_coords)
		VALUES ('IDZT', 'pdf/sample.pdf', 2, '332,614,161,19')
		"""
	)
	con.commit()
	con.close()


class API:
	def __init__(self):
		self.markMode = False;
		self._window = None
		self.current_pdf_path = "pdf/sample.pdf"

	def set_window(self, window):
		self._window = window

	def open_file_dialog(self):
		pdf_path = self._window.create_file_dialog(
			webview.FileDialog.OPEN,
			allow_multiple = False,
			file_types = ('PDF files (*.pdf)', 'All files (*.*)')
		)

		if pdf_path:
			# ----- 取得程式絕對路徑 ----- #
			app_path = os.path.dirname(os.path.abspath(__name__))
			
			# ----- 取得檔案相對路徑 ----- #
			try:
				rel_path = os.path.relpath(pdf_path[0], app_path)
				self.current_pdf_path = rel_path.replace('\\', '/')
			except ValueError:
				print("PDF file must be in the pdf directory.")

			self._window.evaluate_js(f"loadPDF('{self.current_pdf_path}', true)")
		else:
			return

	def set_mark_mode(self, value):
		if value == 1:
			self.markMode = True;
		else:
			self.markMode = False;
		# ----- for debug ----- #
		#print(f"markMode = {self.markMode}")
		# ----- for debug ----- #

	def save_mapping_dialog(self, page_number, coords):
		confirm = self._window.create_confirmation_dialog('Confirm mapping', 'Save this mapping?')
		if not confirm:
			return

		code_snippet = pyperclip.paste().strip()
		if not code_snippet:
			return

		coords_str = ",".join([str(x) for x in coords])

		con = sqlite3.connect("db/mappings.db")
		cursor = con.cursor()
		cursor.execute(
			"""
			INSERT INTO mappings (code_snippet, pdf_path, page_number, rect_coords)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(code_snippet) DO UPDATE SET
				pdf_path = excluded.pdf_path,
                page_number = excluded.page_number,
                rect_coords = excluded.rect_coords
			""", (code_snippet, self.current_pdf_path, page_number, coords_str)
		)
		con.commit()
		con.close()

	def search_and_jump(self, text):
		text = text.strip()
		con = sqlite3.connect("db/mappings.db")
		cursor = con.cursor()
		cursor.execute(
			"SELECT pdf_path, page_number, rect_coords FROM mappings WHERE code_snippet = ?",
			(text,),
		)
		result = cursor.fetchone()
		con.close()

		if result and self._window:
			pdf_path, page_num, coords_str = result
			coords = [float(x) for x in coords_str.split(',')]
			coords_json = json.dumps(coords)
			# ----- for debug ----- #
			#print(f"跳轉至第 {page_num} 頁")
			# ----- for debug ----- #
			self._window.evaluate_js(f"jumpToPage({page_num}, {coords_json}, '{pdf_path}')")
		else:
			# ----- for debug ----- #
			#print(f"資料庫中無對應資料")
			# ----- for debug ----- #
			self._window.evaluate_js("jumpToPage(0)")


# ----- an instance of API class ----- #
api = API()


def on_hotkey_triggered():
	if not api.markMode:
		time.sleep(0.2)
		selected_text = pyperclip.paste()
		if selected_text:
			pyperclip.copy('')
		api.search_and_jump(selected_text)
	else:
		pass


def start_hotkey_listener():
	with keyboard.GlobalHotKeys(
		{"<ctrl>+c": on_hotkey_triggered}
	) as h:
		h.join()


if __name__ == "__main__":
	init_db()

	# ----- initialize the first copy ----- #
	pyperclip.copy('')

	threading.Thread(target = start_hotkey_listener, daemon = True).start()
	window = webview.create_window(
		"Code Helper",
		url = "index.html",
		js_api = api,
		width = 1100,
		height = 700
	)
	api.set_window(window)

	webview.start(icon = "elma-icon.ico", gui = "wpf")
