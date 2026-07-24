import sqlite3
conn=sqlite3.connect('data/saga.sqlite3')
print("COUNT:", conn.execute('SELECT count(*) FROM stages').fetchone()[0])
